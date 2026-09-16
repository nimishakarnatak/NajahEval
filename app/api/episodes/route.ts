import { ensureNajahSchema, getDatabase } from "@/db";
import {
  BUNDLED_DATASET_VERSION,
  ensureBundledDataset,
} from "@/lib/bundled-dataset";
import { normalizeStudentStatus, normalizeTreatment } from "@/lib/episode-dimensions";
import { resolveEpisodeLanguage } from "@/lib/language";
import {
  CRITICAL_FLAG_KEYS,
  DIMENSION_KEYS,
  PARTICIPANT_BEHAVIOUR_KEYS,
  PARTICIPANT_REACTION_KEYS,
  STOPPING_FACTOR_KEYS,
  CriticalFailureObserved,
  CriticalFlagValue,
  DimensionScore,
  keyedRecord,
} from "@/lib/rubric";
import { getRaterIdentity } from "@/lib/server-auth";
import { requiredRatingsForAssignment } from "@/lib/server-assignment-requirements";
import {
  isJudgeCohort,
  isPrimaryCohort,
  reviewLayerForAccount,
  type AssignmentCohort,
} from "@/lib/study-assignments";

/** Fixed episode predicate for a signed-in account's assigned queue. */
function queuePredicate(role: string, assignment: AssignmentCohort): string {
  if (role === "admin" || role === "viewer") return "TRUE";
  if (assignment === "group_a") return "e.study_order BETWEEN 1 AND 100";
  if (assignment === "group_b") return "e.study_order BETWEEN 101 AND 200";
  if (assignment === "group_c") return "e.study_order BETWEEN 201 AND 300";
  if (assignment === "judge_1") {
    return `(
      e.judge_base_assignment = 'judge_1'
      OR (
        e.judge_base_assignment = ''
        AND COALESCE(primary_summary.primary_serious_mismatch, FALSE)
        AND MOD(e.study_order, 2) = 1
      )
    )`;
  }
  if (assignment === "judge_2") {
    return `(
      e.judge_base_assignment = 'judge_2'
      OR (
        e.judge_base_assignment = ''
        AND COALESCE(primary_summary.primary_serious_mismatch, FALSE)
        AND MOD(e.study_order, 2) = 0
      )
    )`;
  }
  return "FALSE";
}

/** Fixed completion predicate for the review layer visible to this account. */
function completionPredicate(role: string, assignment: AssignmentCohort): string {
  if (role === "admin" || role === "viewer") return "completed.review_layer = 'primary'";
  if (isPrimaryCohort(assignment)) {
    return `completed.review_layer = 'primary' AND completed.assignment_cohort = '${assignment}'`;
  }
  if (isJudgeCohort(assignment)) {
    return `completed.review_layer = 'judge' AND completed.assignment_cohort = '${assignment}'`;
  }
  return "FALSE";
}

/**
 * Reads a JSON object stored in Postgres while providing every expected key. A bad or
 * old value becomes a blank draft instead of breaking the annotator queue.
 */
function parseKeyedJson<T, K extends readonly string[] = readonly string[]>(
  value: unknown,
  keys: K,
  defaultValue: () => T,
): Record<K[number], T> {
  let parsed: Record<string, unknown> = {};
  if (typeof value === "string" && value) {
    try {
      const candidate = JSON.parse(value) as unknown;
      if (typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)) {
        parsed = candidate as Record<string, unknown>;
      }
    } catch {
      // The keyed defaults below intentionally recover malformed legacy data.
    }
  }
  const result = keyedRecord(keys, defaultValue);
  for (const key of keys as readonly K[number][]) {
    if (Object.hasOwn(parsed, key)) result[key] = parsed[key] as T;
  }
  return result;
}

export async function GET(request: Request) {
  const rater = await getRaterIdentity(request);
  if (!rater) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }

  const db = getDatabase();
  await ensureNajahSchema(db);
  await ensureBundledDataset(db);
  const assignment = rater.assignmentCohort;
  const reviewLayer = reviewLayerForAccount(rater.role, assignment);
  const requiredRatingsPerEpisode = await requiredRatingsForAssignment(db, assignment);

  const result = await db
    .prepare(`
      SELECT
        e.episode_id AS "episodeId",
        e.study_order AS "studyOrder",
        e.judge_base_assignment AS "judgeBaseAssignment",
        e.student_status AS "studentStatus",
        e.language,
        e.module,
        e.treatment,
        e.module_objective AS "moduleObjective",
        e.prior_context AS "priorContext",
        e.transcript,
        e.subsequent_context AS "subsequentContext",
        e.language_review_status AS "languageReviewStatus",
        COALESCE(primary_summary.primary_count, 0) AS "primaryRatingCount",
        COALESCE(primary_summary.primary_mismatch, FALSE) AS "primaryMismatch",
        COALESCE(primary_summary.primary_serious_mismatch, FALSE) AS "primarySeriousMismatch",
        (
          SELECT COUNT(*) FROM rubric_annotations completed
          WHERE completed.episode_id = e.episode_id
            AND completed.status = 'complete'
            AND ${completionPredicate(rater.role, assignment)}
        ) AS "completedRaterCount",
        current.scores_json AS "scoresJson",
        current.evidence_turns_json AS "evidenceTurnsJson",
        current.justifications_json AS "justificationsJson",
        current.critical_failure_observed AS "criticalFailureObserved",
        current.critical_flags_json AS "criticalFlagsJson",
        current.critical_evidence_json AS "criticalEvidenceJson",
        current.critical_evidence_turns_json AS "criticalEvidenceTurnsJson",
        current.task_status AS "taskStatus",
        current.task_incomplete_reason AS "taskIncompleteReason",
        current.participant_responses_json AS "participantResponsesJson",
        current.participant_response_other AS "participantResponseOther",
        current.participant_behaviours_json AS "participantBehavioursJson",
        current.participant_behaviour_evidence_turns_json AS "participantBehaviourEvidenceTurnsJson",
        current.participant_behaviour_other AS "participantBehaviourOther",
        current.participant_reactions_json AS "participantReactionsJson",
        current.participant_reaction_evidence_turns_json AS "participantReactionEvidenceTurnsJson",
        current.participant_reaction_other AS "participantReactionOther",
        current.module_episode_ending AS "episodeEnding",
        current.stopping_factors_json AS "stoppingFactorsJson",
        current.stopping_factors_evidence_turns AS "stoppingFactorsEvidenceTurns",
        current.stopping_factors_explanation AS "stoppingFactorsExplanation",
        current.gender_context_handling AS "genderContextHandling",
        current.most_useful_thing AS "mostUsefulThing",
        current.suggested_improvement AS "suggestedImprovement",
        current.skip_reason AS "skipReason",
        current.episode_end_reason AS "legacyEpisodeEndReason",
        current.comments,
        current.rubric_version AS "rubricVersion",
        current.status AS "annotationStatus",
        current.updated_at AS "annotationUpdatedAt"
      FROM episodes e
      LEFT JOIN rubric_annotations current
        ON current.episode_id = e.episode_id
       AND current.rater_id = ?
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS primary_count,
          (
            COUNT(*) >= 2
            AND (
              COUNT(DISTINCT primary_rating.scores_json) > 1
              OR COUNT(DISTINCT primary_rating.task_status) > 1
              OR COUNT(DISTINCT primary_rating.task_incomplete_reason) > 1
              OR COUNT(DISTINCT primary_rating.participant_responses_json) > 1
              OR COUNT(DISTINCT primary_rating.participant_behaviours_json) > 1
              OR COUNT(DISTINCT primary_rating.participant_reactions_json) > 1
              OR COUNT(DISTINCT primary_rating.module_episode_ending) > 1
              OR COUNT(DISTINCT primary_rating.gender_context_handling) > 1
              OR COUNT(DISTINCT primary_rating.critical_failure_observed) > 1
              OR COUNT(DISTINCT primary_rating.critical_flags_json) > 1
            )
          ) AS primary_mismatch,
          (
            COUNT(*) >= 2
            AND (
              COUNT(DISTINCT primary_rating.task_status) > 1
              OR COUNT(DISTINCT primary_rating.task_incomplete_reason) > 1
              OR COUNT(DISTINCT primary_rating.module_episode_ending) > 1
              OR COUNT(DISTINCT primary_rating.gender_context_handling) > 1
              OR COUNT(DISTINCT primary_rating.critical_failure_observed) > 1
              OR COUNT(DISTINCT primary_rating.critical_flags_json) > 1
              OR EXISTS (
                SELECT 1
                FROM (
                  SELECT
                    score_entry.key,
                    BOOL_OR(score_entry.value = '1') AS has_one,
                    BOOL_OR(score_entry.value = '3') AS has_three,
                    BOOL_OR(score_entry.value = 'na') AS has_na,
                    BOOL_OR(score_entry.value IN ('1', '2', '3')) AS has_substantive
                  FROM rubric_annotations primary_score
                  CROSS JOIN LATERAL jsonb_each_text(
                    primary_score.scores_json::jsonb
                  ) score_entry
                  WHERE primary_score.episode_id = e.episode_id
                    AND primary_score.status = 'complete'
                    AND primary_score.review_layer = 'primary'
                    AND primary_score.assignment_cohort = CASE
                      WHEN e.study_order BETWEEN 1 AND 100 THEN 'group_a'
                      WHEN e.study_order BETWEEN 101 AND 200 THEN 'group_b'
                      WHEN e.study_order BETWEEN 201 AND 300 THEN 'group_c'
                      ELSE ''
                    END
                  GROUP BY score_entry.key
                ) score_gap
                WHERE (score_gap.has_one AND score_gap.has_three)
                   OR (score_gap.has_na AND score_gap.has_substantive)
              )
            )
          ) AS primary_serious_mismatch
        FROM rubric_annotations primary_rating
        WHERE primary_rating.episode_id = e.episode_id
          AND primary_rating.status = 'complete'
          AND primary_rating.review_layer = 'primary'
          AND primary_rating.assignment_cohort = CASE
            WHEN e.study_order BETWEEN 1 AND 100 THEN 'group_a'
            WHEN e.study_order BETWEEN 101 AND 200 THEN 'group_b'
            WHEN e.study_order BETWEEN 201 AND 300 THEN 'group_c'
            ELSE ''
          END
      ) primary_summary ON TRUE
      WHERE e.import_batch = ?
        AND ${queuePredicate(rater.role, assignment)}
      ORDER BY e.study_order
    `)
    .bind(rater.id, BUNDLED_DATASET_VERSION)
    .all();

  // Older imports stored only the primary language. Resolve the display value
  // when episodes are read so already-imported code-switched conversations are
  // upgraded without requiring annotators to upload the dataset again.
  const episodes = result.results.map((row) => {
    const episode = row as Record<string, unknown>;
    const criticalFlags = parseKeyedJson<CriticalFlagValue>(
      episode.criticalFlagsJson,
      CRITICAL_FLAG_KEYS,
      () => null,
    );
    const storedFailureObserved = episode.criticalFailureObserved;
    const criticalFailureObserved: CriticalFailureObserved | "" =
      storedFailureObserved === "yes" ||
      storedFailureObserved === "no" ||
      storedFailureObserved === "cannot_determine"
        ? storedFailureObserved
        : CRITICAL_FLAG_KEYS.some((key) => criticalFlags[key] === "yes")
          ? "yes"
          : CRITICAL_FLAG_KEYS.filter((key) => key !== "otherSeriousFailure").every(
              (key) => criticalFlags[key] === "no",
            )
            ? "no"
            : "";
    const participantBehaviours = parseKeyedJson<boolean>(
      episode.participantBehavioursJson,
      PARTICIPANT_BEHAVIOUR_KEYS,
      () => false,
    );
    const participantReactions = parseKeyedJson<boolean>(
      episode.participantReactionsJson,
      PARTICIPANT_REACTION_KEYS,
      () => false,
    );
    let participantBehaviourOther = typeof episode.participantBehaviourOther === "string"
      ? episode.participantBehaviourOther
      : "";
    let participantReactionOther = typeof episode.participantReactionOther === "string"
      ? episode.participantReactionOther
      : "";

    // Ratings saved before v12 used one combined question. Translate those
    // values only when the new fields are still blank, preserving the older
    // judgment without showing removed ending categories in Section B.
    if (
      !PARTICIPANT_BEHAVIOUR_KEYS.some((key) => participantBehaviours[key]) &&
      !PARTICIPANT_REACTION_KEYS.some((key) => participantReactions[key])
    ) {
      const legacy = parseKeyedJson<boolean>(
        episode.participantResponsesJson,
        [
          "providedRequestedInformation",
          "attemptedRequestedAction",
          "usedOrRespondedToOutput",
          "askedFollowUpQuestion",
          "correctedOrDisagreed",
          "expressedSatisfaction",
          "expressedConfusionOrFrustration",
          "changedModule",
          "noFurtherReply",
          "noClearResponse",
          "cannotDetermine",
          "otherObservableResponse",
        ] as const,
        () => false,
      );
      for (const key of [
        "providedRequestedInformation",
        "attemptedRequestedAction",
        "usedOrRespondedToOutput",
        "askedFollowUpQuestion",
        "correctedOrDisagreed",
      ] as const) participantBehaviours[key] = legacy[key];
      participantBehaviours.otherObservableBehaviour = legacy.otherObservableResponse;
      participantBehaviours.noClearBehaviouralResponse = legacy.noClearResponse;
      participantBehaviours.cannotDetermine = legacy.cannotDetermine;
      participantReactions.expressedSatisfaction = legacy.expressedSatisfaction;
      if (legacy.expressedConfusionOrFrustration) {
        participantReactions.otherExpressedReaction = true;
        participantReactionOther = "Legacy coding: expressed confusion or frustration (not separable).";
      }
      if (
        (legacy.changedModule || legacy.noFurtherReply) &&
        !PARTICIPANT_BEHAVIOUR_KEYS.some((key) => participantBehaviours[key])
      ) participantBehaviours.noClearBehaviouralResponse = true;
      if (legacy.otherObservableResponse && !participantBehaviourOther) {
        participantBehaviourOther = typeof episode.participantResponseOther === "string"
          ? episode.participantResponseOther
          : "Legacy participant response (not further specified).";
      }
      if (!PARTICIPANT_REACTION_KEYS.some((key) => participantReactions[key])) {
        participantReactions.noExplicitReaction = true;
      }
    }
    return {
      ...episode,
      // Mismatch alerts support judge adjudication without disclosing either
      // primary rater's score. Primary raters never receive this signal.
      primaryRatingCount:
        reviewLayer === "judge" || rater.role === "admin"
          ? Number(episode.primaryRatingCount ?? 0)
          : 0,
      primaryMismatch:
        (reviewLayer === "judge" || rater.role === "admin") &&
        episode.primaryMismatch === true,
      primarySeriousMismatch:
        (reviewLayer === "judge" || rater.role === "admin") &&
        episode.primarySeriousMismatch === true,
      scores: parseKeyedJson<DimensionScore>(episode.scoresJson, DIMENSION_KEYS, () => null),
      evidenceTurns: parseKeyedJson<string>(episode.evidenceTurnsJson, DIMENSION_KEYS, () => ""),
      justifications: parseKeyedJson<string>(episode.justificationsJson, DIMENSION_KEYS, () => ""),
      criticalFailureObserved,
      criticalFlags,
      criticalEvidence: parseKeyedJson<string>(episode.criticalEvidenceJson, CRITICAL_FLAG_KEYS, () => ""),
      criticalEvidenceTurns: parseKeyedJson<string>(episode.criticalEvidenceTurnsJson, CRITICAL_FLAG_KEYS, () => ""),
      taskStatus: episode.taskStatus === "completed_acknowledged"
        ? "outcome_delivered_confirmation_observed"
        : episode.taskStatus === "output_delivered_unacknowledged"
          ? "output_delivered_confirmation_not_observed"
          : episode.taskStatus === "not_completed"
            ? "in_progress_no_output"
            : typeof episode.taskStatus === "string" ? episode.taskStatus : "",
      participantBehaviours,
      participantBehaviourEvidenceTurns: parseKeyedJson<string>(episode.participantBehaviourEvidenceTurnsJson, PARTICIPANT_BEHAVIOUR_KEYS, () => ""),
      participantBehaviourOther,
      participantReactions,
      participantReactionEvidenceTurns: parseKeyedJson<string>(episode.participantReactionEvidenceTurnsJson, PARTICIPANT_REACTION_KEYS, () => ""),
      participantReactionOther,
      episodeEnding: typeof episode.episodeEnding === "string" ? episode.episodeEnding : "",
      stoppingFactors: parseKeyedJson<boolean>(episode.stoppingFactorsJson, STOPPING_FACTOR_KEYS, () => false),
      stoppingFactorsEvidenceTurns: typeof episode.stoppingFactorsEvidenceTurns === "string" ? episode.stoppingFactorsEvidenceTurns : "",
      stoppingFactorsExplanation: typeof episode.stoppingFactorsExplanation === "string" ? episode.stoppingFactorsExplanation : "",
      genderContextHandling: typeof episode.genderContextHandling === "string" ? episode.genderContextHandling : "",
      mostUsefulThing: typeof episode.mostUsefulThing === "string" ? episode.mostUsefulThing : "",
      suggestedImprovement: typeof episode.suggestedImprovement === "string" ? episode.suggestedImprovement : "",
      skipReason: typeof episode.skipReason === "string" ? episode.skipReason : "",
      legacyEpisodeEndReason:
        typeof episode.legacyEpisodeEndReason === "string" ? episode.legacyEpisodeEndReason : "",
      studentStatus: normalizeStudentStatus(episode.studentStatus),
      treatment: normalizeTreatment(episode.treatment),
      language: resolveEpisodeLanguage(
        typeof episode.language === "string" ? episode.language : undefined,
        typeof episode.transcript === "string" ? episode.transcript : "",
      ),
    };
  });

  return Response.json({
    rater,
    reviewLayer,
    requiredRatingsPerEpisode,
    episodes,
  });
}
