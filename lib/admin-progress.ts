import { ensureNajahSchema, getDatabase } from "@/db";
import {
  BUNDLED_DATASET_VERSION,
  ensureBundledDataset,
} from "@/lib/bundled-dataset";
import {
  REQUIRED_JUDGE_RATINGS_PER_EPISODE,
  REQUIRED_PRIMARY_RATINGS_PER_EPISODE,
} from "@/lib/rating-policy";
import {
  ASSIGNMENT_OPTIONS,
  assignmentCohortLabel,
  assignmentEpisodeCount,
  isAssignmentCohort,
  isJudgeCohort,
  judgeAssignmentForEpisode,
  primaryCohortForOrder,
  type AssignedCohort,
  type AssignmentCohort,
  type JudgeAssignment,
} from "@/lib/study-assignments";
import {
  summarizePrimaryMismatch,
  type ComparablePrimaryRating,
} from "@/lib/rating-mismatch";
import type { UserRole } from "@/lib/user-roles";

export type EvaluatorProgress = {
  raterId: string;
  displayName: string;
  email: string;
  role: UserRole;
  canRate: boolean;
  isActive: boolean;
  assignmentCohort: AssignmentCohort;
  assignedEpisodeCount: number;
  joinedAt: string | null;
  completedCount: number;
  draftCount: number;
  notStartedCount: number;
  completionPercentage: number;
  lastActivity: string | null;
};

export type AssignmentProgress = {
  assignmentCohort: AssignedCohort;
  label: string;
  assignedEpisodes: number;
  activeMembers: number;
  capacity: number | null;
  completedCount: number;
  expectedCount: number;
  completionPercentage: number;
};

export type AdminProgress = {
  totalEpisodes: number;
  totalEvaluators: number;
  activeEvaluators: number;
  completedRatings: number;
  draftRatings: number;
  expectedRatings: number;
  coverage: {
    noPrimaryRating: number;
    onePrimaryRating: number;
    primaryComplete: number;
    judgePending: number;
    judgeComplete: number;
  };
  assignments: AssignmentProgress[];
  evaluators: EvaluatorProgress[];
};

type RawEvaluatorProgress = {
  raterId: string;
  displayName: string;
  email: string;
  role: UserRole;
  canRate: boolean;
  isActive: boolean;
  assignmentCohort: string;
  joinedAt: string | Date | null;
  completedCount: number | string;
  draftCount: number | string;
  lastActivity: string | Date | null;
};

type RawEpisodeAssignment = {
  episodeId: string;
  studyOrder: number | string;
  judgeBaseAssignment: JudgeAssignment;
};

type RawStudyRating = ComparablePrimaryRating & {
  episodeId: string;
  raterId: string;
  reviewLayer: "primary" | "judge";
  assignmentCohort: string;
  status: "draft" | "complete";
};

/** Convert a database timestamp into a stable JSON-safe value. */
function timestampToIso(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Build progress for flexible primary-rater groups and the separate judge
 * layer. A rating is counted for a current assignment only when the immutable
 * assignment snapshot on the rating matches the evaluator's account. Legacy
 * and administrator-demo ratings remain exportable but do not affect study
 * completion.
 */
export async function getAdminProgress(): Promise<AdminProgress> {
  const db = getDatabase();
  await ensureNajahSchema(db);
  await ensureBundledDataset(db);

  const [episodeResult, evaluatorResult, studyRatingResult] = await Promise.all([
    db
      .prepare(`
        SELECT
          episode_id AS "episodeId",
          study_order AS "studyOrder",
          judge_base_assignment AS "judgeBaseAssignment"
        FROM episodes
        WHERE import_batch = ?
        ORDER BY study_order
      `)
      .bind(BUNDLED_DATASET_VERSION)
      .all<RawEpisodeAssignment>(),
    db.prepare(`
      SELECT
        u.user_id AS "raterId",
        u.display_name AS "displayName",
        u.email,
        u.role,
        u.can_rate AS "canRate",
        u.is_active AS "isActive",
        u.assignment_cohort AS "assignmentCohort",
        u.created_at AS "joinedAt",
        COUNT(active_episode.episode_id) FILTER (
          WHERE ra.status = 'complete'
            AND (
              (u.role = 'admin' AND ra.review_layer = 'admin_demo')
              OR (
                u.role != 'admin'
                AND u.assignment_cohort != 'unassigned'
                AND ra.assignment_cohort = u.assignment_cohort
                AND ra.review_layer = CASE
                  WHEN u.assignment_cohort IN ('judge_1', 'judge_2') THEN 'judge'
                  ELSE 'primary'
                END
              )
              OR (
                u.role != 'admin'
                AND u.assignment_cohort = 'unassigned'
                AND ra.review_layer IN ('primary', 'judge')
              )
            )
        ) AS "completedCount",
        COUNT(active_episode.episode_id) FILTER (
          WHERE ra.status = 'draft'
            AND (
              (u.role = 'admin' AND ra.review_layer = 'admin_demo')
              OR (
                u.role != 'admin'
                AND u.assignment_cohort != 'unassigned'
                AND ra.assignment_cohort = u.assignment_cohort
                AND ra.review_layer = CASE
                  WHEN u.assignment_cohort IN ('judge_1', 'judge_2') THEN 'judge'
                  ELSE 'primary'
                END
              )
              OR (
                u.role != 'admin'
                AND u.assignment_cohort = 'unassigned'
                AND ra.review_layer IN ('primary', 'judge')
              )
            )
        ) AS "draftCount",
        MAX(ra.updated_at) FILTER (WHERE active_episode.episode_id IS NOT NULL) AS "lastActivity"
      FROM users u
      LEFT JOIN rubric_annotations ra ON ra.rater_id = u.user_id
      LEFT JOIN episodes active_episode
        ON active_episode.episode_id = ra.episode_id
       AND active_episode.import_batch = ?
      WHERE u.can_rate = TRUE
         OR EXISTS (
           SELECT 1 FROM rubric_annotations saved
           WHERE saved.rater_id = u.user_id
         )
      GROUP BY
        u.user_id, u.display_name, u.email, u.role, u.can_rate, u.is_active,
        u.assignment_cohort, u.created_at
      ORDER BY LOWER(u.display_name), LOWER(u.email)
    `).bind(BUNDLED_DATASET_VERSION).all<RawEvaluatorProgress>(),
    db.prepare(`
      SELECT
        ra.episode_id AS "episodeId",
        ra.rater_id AS "raterId",
        ra.review_layer AS "reviewLayer",
        ra.assignment_cohort AS "assignmentCohort",
        ra.status,
        ra.scores_json AS "scoresJson",
        ra.task_status AS "taskStatus",
        ra.task_incomplete_reason AS "taskIncompleteReason",
        ra.participant_responses_json AS "participantResponsesJson",
        ra.participant_behaviours_json AS "participantBehavioursJson",
        ra.participant_reactions_json AS "participantReactionsJson",
        ra.module_episode_ending AS "episodeEnding",
        ra.gender_context_handling AS "genderContextHandling",
        ra.critical_failure_observed AS "criticalFailureObserved",
        ra.critical_flags_json AS "criticalFlagsJson"
      FROM rubric_annotations ra
      INNER JOIN episodes e ON e.episode_id = ra.episode_id
      WHERE e.import_batch = ?
        AND ra.review_layer IN ('primary', 'judge')
    `).bind(BUNDLED_DATASET_VERSION).all<RawStudyRating>(),
  ]);

  const episodes = episodeResult.results;
  const totalEpisodes = episodes.length;
  const episodeById = new Map(episodes.map((episode) => [episode.episodeId, episode]));
  const primaryRatingsByEpisode = new Map<string, ComparablePrimaryRating[]>();

  for (const rating of studyRatingResult.results) {
    const episode = episodeById.get(rating.episodeId);
    if (
      !episode ||
      rating.status !== "complete" ||
      rating.reviewLayer !== "primary" ||
      rating.assignmentCohort !== primaryCohortForOrder(Number(episode.studyOrder))
    ) continue;
    const ratings = primaryRatingsByEpisode.get(rating.episodeId) ?? [];
    ratings.push(rating);
    primaryRatingsByEpisode.set(rating.episodeId, ratings);
  }

  const mismatchByEpisode = new Map(
    episodes.map((episode) => [
      episode.episodeId,
      summarizePrimaryMismatch(primaryRatingsByEpisode.get(episode.episodeId) ?? []),
    ]),
  );
  const requiredJudgeByEpisode = new Map<string, JudgeAssignment>();
  for (const episode of episodes) {
    const requiredJudge = judgeAssignmentForEpisode(
      episode.judgeBaseAssignment,
      Number(episode.studyOrder),
      mismatchByEpisode.get(episode.episodeId)?.seriousMismatch ?? false,
    );
    if (requiredJudge) requiredJudgeByEpisode.set(episode.episodeId, requiredJudge);
  }
  const assignedEpisodeCountByJudge = {
    judge_1: Array.from(requiredJudgeByEpisode.values()).filter((value) => value === "judge_1").length,
    judge_2: Array.from(requiredJudgeByEpisode.values()).filter((value) => value === "judge_2").length,
  };

  /** Keep only ratings that belong to the currently defined study assignment. */
  const currentStudyRatings = studyRatingResult.results.filter((rating) => {
    const episode = episodeById.get(rating.episodeId);
    if (!episode) return false;
    if (rating.reviewLayer === "primary") {
      return rating.assignmentCohort === primaryCohortForOrder(Number(episode.studyOrder));
    }
    return rating.assignmentCohort === requiredJudgeByEpisode.get(rating.episodeId);
  });

  const evaluators = evaluatorResult.results.map((row): EvaluatorProgress => {
    const assignmentCohort: AssignmentCohort = isAssignmentCohort(row.assignmentCohort)
      ? row.assignmentCohort
      : "unassigned";
    const assignedStudyRows = currentStudyRatings.filter(
      (rating) => rating.raterId === row.raterId,
    );
    const completedCount = row.role === "admin"
      ? Number(row.completedCount ?? 0)
      : assignedStudyRows.filter((rating) => rating.status === "complete").length;
    const draftCount = row.role === "admin"
      ? Number(row.draftCount ?? 0)
      : assignedStudyRows.filter((rating) => rating.status === "draft").length;
    const historicalWork = completedCount + draftCount > 0;
    const assignedEpisodeCount = isJudgeCohort(assignmentCohort)
      ? assignedEpisodeCountByJudge[assignmentCohort]
      : assignmentEpisodeCount(assignmentCohort) ||
      (row.role === "admin" && row.canRate ? totalEpisodes : historicalWork ? totalEpisodes : 0);
    const notStartedCount = Math.max(assignedEpisodeCount - completedCount - draftCount, 0);
    const completionPercentage = assignedEpisodeCount
      ? Math.min(Math.round((completedCount / assignedEpisodeCount) * 100), 100)
      : 0;

    return {
      raterId: row.raterId,
      displayName: row.displayName,
      email: row.email,
      role: row.role,
      canRate: row.canRate,
      isActive: row.isActive,
      assignmentCohort,
      assignedEpisodeCount,
      joinedAt: timestampToIso(row.joinedAt),
      completedCount,
      draftCount,
      notStartedCount,
      completionPercentage,
      lastActivity: timestampToIso(row.lastActivity),
    };
  });

  const assignments = ASSIGNMENT_OPTIONS.map((option): AssignmentProgress => {
    const members = evaluators.filter(
      (evaluator) => evaluator.assignmentCohort === option.value,
    );
    const completedCount = members.reduce(
      (total, evaluator) => total + evaluator.completedCount,
      0,
    );
    const assignedEpisodes = isJudgeCohort(option.value)
      ? assignedEpisodeCountByJudge[option.value]
      : option.episodeCount;
    const activeMembers = members.filter(
      (evaluator) => evaluator.isActive && evaluator.canRate,
    ).length;
    const requiredMembers = option.capacity ?? Math.max(
      activeMembers,
      REQUIRED_PRIMARY_RATINGS_PER_EPISODE,
    );
    const expectedCount = assignedEpisodes * requiredMembers;
    return {
      assignmentCohort: option.value,
      label: assignmentCohortLabel(option.value),
      assignedEpisodes,
      activeMembers,
      capacity: option.capacity,
      completedCount,
      expectedCount,
      completionPercentage: expectedCount
        ? Math.min(Math.round((completedCount / expectedCount) * 100), 100)
        : 0,
    };
  });

  const completedRatings = currentStudyRatings.filter(
    (rating) => rating.status === "complete",
  ).length;
  const draftRatings = currentStudyRatings.filter(
    (rating) => rating.status === "draft",
  ).length;
  const judgeRequiredEpisodes = requiredJudgeByEpisode.size;
  const judgeCompletedEpisodes = episodes.filter((episode) => {
    const requiredJudge = requiredJudgeByEpisode.get(episode.episodeId);
    if (!requiredJudge) return false;
    return currentStudyRatings.filter(
      (rating) =>
        rating.episodeId === episode.episodeId &&
        rating.reviewLayer === "judge" &&
        rating.assignmentCohort === requiredJudge &&
        rating.status === "complete",
    ).length >= REQUIRED_JUDGE_RATINGS_PER_EPISODE;
  }).length;

  return {
    totalEpisodes,
    totalEvaluators: evaluators.length,
    activeEvaluators: evaluators.filter(
      (evaluator) => evaluator.completedCount + evaluator.draftCount > 0,
    ).length,
    completedRatings,
    draftRatings,
    expectedRatings: assignments.reduce(
      (total, assignment) => total + assignment.expectedCount,
      0,
    ),
    coverage: {
      noPrimaryRating: episodes.filter(
        (episode) => (mismatchByEpisode.get(episode.episodeId)?.ratingCount ?? 0) === 0,
      ).length,
      onePrimaryRating: episodes.filter(
        (episode) => (mismatchByEpisode.get(episode.episodeId)?.ratingCount ?? 0) === 1,
      ).length,
      primaryComplete: episodes.filter(
        (episode) =>
          (mismatchByEpisode.get(episode.episodeId)?.ratingCount ?? 0) >=
          REQUIRED_PRIMARY_RATINGS_PER_EPISODE,
      ).length,
      judgePending: judgeRequiredEpisodes - judgeCompletedEpisodes,
      judgeComplete: judgeCompletedEpisodes,
    },
    assignments,
    evaluators,
  };
}
