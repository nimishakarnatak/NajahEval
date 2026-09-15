import { ensureNajahSchema, getDatabase } from "@/db";
import {
  BUNDLED_DATASET_VERSION,
  ensureBundledDataset,
} from "@/lib/bundled-dataset";
import {
  annotationExportCsv,
  exportFilenamePart,
  type ExportAnnotationRow,
} from "@/lib/annotation-export";
import { getRaterIdentity } from "@/lib/server-auth";

type ExportRater = {
  userId: string;
  displayName: string;
  email: string;
};

/** Download one rater's saved work or the administrator's combined dataset. */
export async function GET(request: Request) {
  const admin = await getRaterIdentity(request);
  if (!admin) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }
  if (admin.role !== "admin") {
    return Response.json({ error: "Administrator access is required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const requestedScope = url.searchParams.get("scope");
  const aggregateScope = requestedScope === "combined" || requestedScope === "primary" || requestedScope === "judge"
    ? requestedScope
    : null;
  const raterId = url.searchParams.get("raterId")?.trim() ?? "";
  if (!aggregateScope && !raterId) {
    return Response.json({ error: "Choose a rater or the combined export." }, { status: 400 });
  }

  const db = getDatabase();
  await ensureNajahSchema(db);
  await ensureBundledDataset(db);

  let selectedRater: ExportRater | null = null;
  if (!aggregateScope) {
    selectedRater = await db
      .prepare(`
        SELECT
          user_id AS "userId",
          display_name AS "displayName",
          email
        FROM users
        WHERE user_id = ?
          AND (
            can_rate = TRUE
            OR EXISTS (
              SELECT 1 FROM rubric_annotations saved
              WHERE saved.rater_id = users.user_id
            )
          )
      `)
      .bind(raterId)
      .first<ExportRater>();
    if (!selectedRater) {
      return Response.json({ error: "Rater not found." }, { status: 404 });
    }
  }

  const whereClause = aggregateScope === "primary"
    ? "WHERE e.import_batch = ? AND ra.review_layer = 'primary'"
    : aggregateScope === "judge"
      ? "WHERE e.import_batch = ? AND ra.review_layer = 'judge'"
      : aggregateScope === "combined"
        ? "WHERE e.import_batch = ?"
        : "WHERE e.import_batch = ? AND ra.rater_id = ?";
  const query = db.prepare(`
    SELECT
      ra.rater_id AS "raterId",
      annotation_user.display_name AS "raterName",
      ra.rater_email AS "raterEmail",
      annotation_user.role AS "raterRole",
      annotation_user.can_rate AS "raterCanRate",
      annotation_user.assignment_cohort AS "raterCurrentAssignment",
      ra.review_layer AS "reviewLayer",
      ra.assignment_cohort AS "assignmentCohort",
      ra.episode_id AS "episodeId",
      e.study_order AS "studyOrder",
      e.judge_base_assignment AS "judgeBaseAssignment",
      e.student_status AS "studentStatus",
      e.participant_gender AS "participantGender",
      e.activity_group AS "activityGroup",
      e.sampling_weight AS "samplingWeight",
      e.participant_sampling_probability AS "participantSamplingProbability",
      e.focal_episode_selection_probability AS "focalEpisodeSelectionProbability",
      e.combined_episode_inclusion_probability AS "combinedEpisodeInclusionProbability",
      e.module,
      e.treatment,
      e.language,
      ra.status,
      ra.task_status AS "taskStatus",
      ra.task_incomplete_reason AS "taskIncompleteReason",
      ra.participant_responses_json AS "participantResponsesJson",
      ra.participant_response_other AS "participantResponseOther",
      ra.participant_behaviours_json AS "participantBehavioursJson",
      ra.participant_behaviour_evidence_turns_json AS "participantBehaviourEvidenceTurnsJson",
      ra.participant_behaviour_other AS "participantBehaviourOther",
      ra.participant_reactions_json AS "participantReactionsJson",
      ra.participant_reaction_evidence_turns_json AS "participantReactionEvidenceTurnsJson",
      ra.participant_reaction_other AS "participantReactionOther",
      ra.module_episode_ending AS "episodeEnding",
      ra.gender_context_handling AS "genderContextHandling",
      ra.most_useful_thing AS "mostUsefulThing",
      ra.suggested_improvement AS "suggestedImprovement",
      ra.skip_reason AS "skipReason",
      ra.episode_end_reason AS "legacyEpisodeEndReason",
      ra.critical_failure_observed AS "criticalFailureObserved",
      ra.scores_json AS "scoresJson",
      ra.evidence_turns_json AS "evidenceTurnsJson",
      ra.justifications_json AS "justificationsJson",
      ra.critical_flags_json AS "criticalFlagsJson",
      ra.critical_evidence_json AS "criticalEvidenceJson",
      ra.critical_evidence_turns_json AS "criticalEvidenceTurnsJson",
      ra.comments,
      ra.rubric_version AS "rubricVersion",
      ra.updated_at AS "updatedAt"
    FROM rubric_annotations ra
    INNER JOIN episodes e ON e.episode_id = ra.episode_id
    INNER JOIN users annotation_user ON annotation_user.user_id = ra.rater_id
    ${whereClause}
    ORDER BY LOWER(annotation_user.display_name), ra.episode_id
  `);
  const result = aggregateScope
    ? await query.bind(BUNDLED_DATASET_VERSION).all<ExportAnnotationRow>()
    : await query.bind(BUNDLED_DATASET_VERSION, raterId).all<ExportAnnotationRow>();

  const date = new Date().toISOString().slice(0, 10);
  const filename = aggregateScope === "primary"
    ? `najah-primary-ratings-${date}.csv`
    : aggregateScope === "judge"
      ? `najah-judge-reviews-${date}.csv`
      : aggregateScope === "combined"
        ? `najah-all-evaluation-layers-${date}.csv`
        : `najah-${exportFilenamePart(selectedRater!.displayName)}-${date}.csv`;

  // The UTF-8 byte-order mark keeps Arabic and French text legible when a CSV
  // is opened directly in desktop Excel.
  return new Response(`\uFEFF${annotationExportCsv(result.results)}`, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-type": "text/csv; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}
