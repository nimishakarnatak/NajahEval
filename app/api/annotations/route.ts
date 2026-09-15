import { ensureNajahSchema, getDatabase } from "@/db";
import {
  BUNDLED_DATASET_VERSION,
  ensureBundledDataset,
} from "@/lib/bundled-dataset";
import {
  CRITICAL_FLAGS,
  CRITICAL_FAILURE_OBSERVATIONS,
  CRITICAL_FLAG_KEYS,
  CriticalFailureObserved,
  CriticalFlagKey,
  CriticalFlagValue,
  DIMENSION_KEYS,
  DimensionKey,
  DimensionScore,
  EPISODE_ENDINGS,
  EpisodeEnding,
  GENDER_CONTEXT_OPTIONS,
  GenderContextHandling,
  LEGACY_PARTICIPANT_RESPONSE_KEYS,
  PARTICIPANT_BEHAVIOUR_KEYS,
  ParticipantBehaviourKey,
  PARTICIPANT_REACTION_KEYS,
  ParticipantReactionKey,
  RUBRIC_DIMENSIONS,
  RUBRIC_VERSION,
  STOPPING_FACTOR_KEYS,
  StoppingFactorKey,
  TASK_STATUSES,
  TaskStatus,
  keyedRecord,
} from "@/lib/rubric";
import { getRaterIdentity } from "@/lib/server-auth";
import { requiredRatingsForAssignment } from "@/lib/server-assignment-requirements";
import {
  assignmentIncludesEpisode,
  isAssignedCohort,
  isJudgeCohort,
  primaryCohortForOrder,
  reviewLayerForAccount,
  type JudgeAssignment,
} from "@/lib/study-assignments";
import {
  summarizePrimaryMismatch,
  type ComparablePrimaryRating,
} from "@/lib/rating-mismatch";

type AnnotationPayload = {
  episodeId?: string;
  scores?: Partial<Record<DimensionKey, DimensionScore>>;
  evidenceTurns?: Partial<Record<DimensionKey, string>>;
  justifications?: Partial<Record<DimensionKey, string>>;
  criticalFlags?: Partial<Record<CriticalFlagKey, CriticalFlagValue>>;
  criticalEvidence?: Partial<Record<CriticalFlagKey, string>>;
  criticalEvidenceTurns?: Partial<Record<CriticalFlagKey, string>>;
  criticalFailureObserved?: CriticalFailureObserved | "";
  taskStatus?: TaskStatus | "";
  participantBehaviours?: Partial<Record<ParticipantBehaviourKey, boolean>>;
  participantBehaviourEvidenceTurns?: Partial<Record<ParticipantBehaviourKey, string>>;
  participantBehaviourOther?: string;
  participantReactions?: Partial<Record<ParticipantReactionKey, boolean>>;
  participantReactionEvidenceTurns?: Partial<Record<ParticipantReactionKey, string>>;
  participantReactionOther?: string;
  /** Legacy v11 fields accepted during a rolling deployment. */
  participantResponses?: Partial<Record<(typeof LEGACY_PARTICIPANT_RESPONSE_KEYS)[number], boolean>>;
  participantResponseOther?: string;
  episodeEnding?: EpisodeEnding | "";
  stoppingFactors?: Partial<Record<StoppingFactorKey, boolean>>;
  stoppingFactorsEvidenceTurns?: string;
  stoppingFactorsExplanation?: string;
  genderContextHandling?: GenderContextHandling | "";
  mostUsefulThing?: string;
  suggestedImprovement?: string;
  skipReason?: string;
  comments?: string;
  status?: "draft" | "complete";
  action?: "save" | "skip";
};

type NormalizedAnnotation = {
  scores: Record<DimensionKey, DimensionScore>;
  evidenceTurns: Record<DimensionKey, string>;
  justifications: Record<DimensionKey, string>;
  criticalFlags: Record<CriticalFlagKey, CriticalFlagValue>;
  criticalEvidence: Record<CriticalFlagKey, string>;
  criticalEvidenceTurns: Record<CriticalFlagKey, string>;
  criticalFailureObserved: CriticalFailureObserved | "";
  taskStatus: TaskStatus | "";
  participantBehaviours: Record<ParticipantBehaviourKey, boolean>;
  participantBehaviourEvidenceTurns: Record<ParticipantBehaviourKey, string>;
  participantBehaviourOther: string;
  participantReactions: Record<ParticipantReactionKey, boolean>;
  participantReactionEvidenceTurns: Record<ParticipantReactionKey, string>;
  participantReactionOther: string;
  episodeEnding: EpisodeEnding | "";
  stoppingFactors: Record<StoppingFactorKey, boolean>;
  stoppingFactorsEvidenceTurns: string;
  stoppingFactorsExplanation: string;
  genderContextHandling: GenderContextHandling | "";
  mostUsefulThing: string;
  suggestedImprovement: string;
  skipReason: string;
  comments: string;
};

/** Returns true only for plain JSON objects suitable for keyed rubric data. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A rubric score is blank, one of the anchored integers, or explicit N/A. */
function validDimensionScore(value: unknown): value is DimensionScore {
  return value === null || value === 1 || value === 2 || value === 3 || value === "na";
}

/** A critical flag is blank while drafting, then an explicit Yes or No. */
function validCriticalFlag(value: unknown): value is CriticalFlagValue {
  return value === null || value === "yes" || value === "no";
}

/** Drafts may leave the screening question blank; submissions may not. */
function validCriticalFailureObserved(
  value: unknown,
): value is CriticalFailureObserved | "" {
  return (
    value === "" ||
    CRITICAL_FAILURE_OBSERVATIONS.some((option) => option.value === value)
  );
}

/** Drafts may leave task status blank; completed ratings must select one. */
function validTaskStatus(value: unknown): value is TaskStatus | "" {
  return (
    value === "" ||
    TASK_STATUSES.some((status) => status.value === value)
  );
}

/** Drafts may leave the module ending blank; submissions may not. */
function validEpisodeEnding(value: unknown): value is EpisodeEnding | "" {
  return (
    value === "" ||
    EPISODE_ENDINGS.some((option) => option.value === value)
  );
}

/** Drafts may leave gender-context handling blank; submissions may not. */
function validGenderContext(value: unknown): value is GenderContextHandling | "" {
  return value === "" || GENDER_CONTEXT_OPTIONS.some((option) => option.value === value);
}

/**
 * Normalizes a browser payload into complete keyed objects before validation or
 * storage. Trimming here keeps the database and CSV exports analysis-ready.
 */
function normalizePayload(payload: AnnotationPayload): NormalizedAnnotation | null {
  if (
    (payload.scores !== undefined && !isRecord(payload.scores)) ||
    (payload.evidenceTurns !== undefined && !isRecord(payload.evidenceTurns)) ||
    (payload.justifications !== undefined && !isRecord(payload.justifications)) ||
    (payload.criticalFlags !== undefined && !isRecord(payload.criticalFlags)) ||
    (payload.criticalEvidence !== undefined && !isRecord(payload.criticalEvidence)) ||
    (payload.criticalEvidenceTurns !== undefined && !isRecord(payload.criticalEvidenceTurns)) ||
    (payload.participantBehaviours !== undefined && !isRecord(payload.participantBehaviours)) ||
    (payload.participantBehaviourEvidenceTurns !== undefined && !isRecord(payload.participantBehaviourEvidenceTurns)) ||
    (payload.participantReactions !== undefined && !isRecord(payload.participantReactions)) ||
    (payload.participantReactionEvidenceTurns !== undefined && !isRecord(payload.participantReactionEvidenceTurns)) ||
    (payload.participantResponses !== undefined && !isRecord(payload.participantResponses)) ||
    (payload.stoppingFactors !== undefined && !isRecord(payload.stoppingFactors)) ||
    (payload.criticalFailureObserved !== undefined &&
      !validCriticalFailureObserved(payload.criticalFailureObserved)) ||
    (payload.taskStatus !== undefined && !validTaskStatus(payload.taskStatus)) ||
    (payload.episodeEnding !== undefined && !validEpisodeEnding(payload.episodeEnding)) ||
    (payload.genderContextHandling !== undefined && !validGenderContext(payload.genderContextHandling)) ||
    (payload.participantBehaviourOther !== undefined && typeof payload.participantBehaviourOther !== "string") ||
    (payload.participantReactionOther !== undefined && typeof payload.participantReactionOther !== "string") ||
    (payload.participantResponseOther !== undefined && typeof payload.participantResponseOther !== "string") ||
    (payload.stoppingFactorsEvidenceTurns !== undefined && typeof payload.stoppingFactorsEvidenceTurns !== "string") ||
    (payload.stoppingFactorsExplanation !== undefined && typeof payload.stoppingFactorsExplanation !== "string") ||
    (payload.mostUsefulThing !== undefined && typeof payload.mostUsefulThing !== "string") ||
    (payload.suggestedImprovement !== undefined && typeof payload.suggestedImprovement !== "string") ||
    (payload.skipReason !== undefined && typeof payload.skipReason !== "string") ||
    (payload.comments !== undefined && typeof payload.comments !== "string") ||
    (payload.action !== undefined && payload.action !== "save" && payload.action !== "skip")
  ) {
    return null;
  }

  const scoreSource = (payload.scores ?? {}) as Record<string, unknown>;
  const evidenceSource = (payload.evidenceTurns ?? {}) as Record<string, unknown>;
  const justificationSource = (payload.justifications ?? {}) as Record<string, unknown>;
  const flagSource = (payload.criticalFlags ?? {}) as Record<string, unknown>;
  const criticalEvidenceSource = (payload.criticalEvidence ?? {}) as Record<string, unknown>;
  const criticalEvidenceTurnsSource = (payload.criticalEvidenceTurns ?? {}) as Record<string, unknown>;
  const participantBehaviourSource = (payload.participantBehaviours ?? {}) as Record<string, unknown>;
  const participantBehaviourEvidenceTurnsSource = (payload.participantBehaviourEvidenceTurns ?? {}) as Record<string, unknown>;
  const participantReactionSource = (payload.participantReactions ?? {}) as Record<string, unknown>;
  const participantReactionEvidenceTurnsSource = (payload.participantReactionEvidenceTurns ?? {}) as Record<string, unknown>;
  const legacyParticipantResponseSource = (payload.participantResponses ?? {}) as Record<string, unknown>;
  const stoppingFactorSource = (payload.stoppingFactors ?? {}) as Record<string, unknown>;

  const scores = keyedRecord(DIMENSION_KEYS, () => null as DimensionScore);
  const evidenceTurns = keyedRecord(DIMENSION_KEYS, () => "");
  const justifications = keyedRecord(DIMENSION_KEYS, () => "");
  for (const key of DIMENSION_KEYS) {
    const score = scoreSource[key] ?? null;
    const evidence = evidenceSource[key] ?? "";
    const justification = justificationSource[key] ?? "";
    if (!validDimensionScore(score) || typeof evidence !== "string" || typeof justification !== "string") {
      return null;
    }
    scores[key] = score;
    evidenceTurns[key] = evidence.trim();
    justifications[key] = justification.trim();
  }

  const criticalFlags = keyedRecord(CRITICAL_FLAG_KEYS, () => null as CriticalFlagValue);
  const criticalEvidence = keyedRecord(CRITICAL_FLAG_KEYS, () => "");
  const criticalEvidenceTurns = keyedRecord(CRITICAL_FLAG_KEYS, () => "");
  for (const key of CRITICAL_FLAG_KEYS) {
    const flag = flagSource[key] ?? null;
    const evidence = criticalEvidenceSource[key] ?? "";
    const evidenceTurns = criticalEvidenceTurnsSource[key] ?? "";
    if (!validCriticalFlag(flag) || typeof evidence !== "string" || typeof evidenceTurns !== "string") return null;
    criticalFlags[key] = flag;
    criticalEvidence[key] = evidence.trim();
    criticalEvidenceTurns[key] = evidenceTurns.trim();
  }

  const participantBehaviours = keyedRecord(PARTICIPANT_BEHAVIOUR_KEYS, () => false);
  const participantBehaviourEvidenceTurns = keyedRecord(PARTICIPANT_BEHAVIOUR_KEYS, () => "");
  for (const key of PARTICIPANT_BEHAVIOUR_KEYS) {
    const value = participantBehaviourSource[key] ?? false;
    const turns = participantBehaviourEvidenceTurnsSource[key] ?? "";
    if (typeof value !== "boolean" || typeof turns !== "string") return null;
    participantBehaviours[key] = value;
    participantBehaviourEvidenceTurns[key] = value ? turns.trim() : "";
  }

  const participantReactions = keyedRecord(PARTICIPANT_REACTION_KEYS, () => false);
  const participantReactionEvidenceTurns = keyedRecord(PARTICIPANT_REACTION_KEYS, () => "");
  for (const key of PARTICIPANT_REACTION_KEYS) {
    const value = participantReactionSource[key] ?? false;
    const turns = participantReactionEvidenceTurnsSource[key] ?? "";
    if (typeof value !== "boolean" || typeof turns !== "string") return null;
    participantReactions[key] = value;
    participantReactionEvidenceTurns[key] = value ? turns.trim() : "";
  }

  // A browser tab opened before this release may still submit the combined v11
  // participant-response object. Preserve its meaning until every tab refreshes.
  if (payload.participantBehaviours === undefined && payload.participantResponses !== undefined) {
    for (const key of [
      "providedRequestedInformation",
      "attemptedRequestedAction",
      "usedOrRespondedToOutput",
      "askedFollowUpQuestion",
      "correctedOrDisagreed",
    ] as const) {
      if (legacyParticipantResponseSource[key] === true) participantBehaviours[key] = true;
    }
    if (legacyParticipantResponseSource.otherObservableResponse === true) {
      participantBehaviours.otherObservableBehaviour = true;
    }
    if (legacyParticipantResponseSource.noClearResponse === true) {
      participantBehaviours.noClearBehaviouralResponse = true;
    }
    if (legacyParticipantResponseSource.cannotDetermine === true) {
      participantBehaviours.cannotDetermine = true;
    }
    if (legacyParticipantResponseSource.expressedSatisfaction === true) {
      participantReactions.expressedSatisfaction = true;
    }
    if (legacyParticipantResponseSource.expressedConfusionOrFrustration === true) {
      participantReactions.otherExpressedReaction = true;
    }
  }

  if (participantBehaviours.noClearBehaviouralResponse || participantBehaviours.cannotDetermine) {
    const selectedExclusive = participantBehaviours.cannotDetermine
      ? "cannotDetermine"
      : "noClearBehaviouralResponse";
    for (const key of PARTICIPANT_BEHAVIOUR_KEYS) {
      participantBehaviours[key] = key === selectedExclusive;
      participantBehaviourEvidenceTurns[key] = "";
    }
  }
  if (participantReactions.noExplicitReaction || participantReactions.cannotDetermine) {
    const selectedExclusive = participantReactions.cannotDetermine
      ? "cannotDetermine"
      : "noExplicitReaction";
    for (const key of PARTICIPANT_REACTION_KEYS) {
      participantReactions[key] = key === selectedExclusive;
      participantReactionEvidenceTurns[key] = "";
    }
  }

  const stoppingFactors = keyedRecord(STOPPING_FACTOR_KEYS, () => false);
  for (const key of STOPPING_FACTOR_KEYS) {
    const value = stoppingFactorSource[key] ?? false;
    if (typeof value !== "boolean") return null;
    stoppingFactors[key] = value;
  }
  if (stoppingFactors.noObservableProblem || stoppingFactors.cannotDetermine) {
    const selectedExclusive = stoppingFactors.cannotDetermine ? "cannotDetermine" : "noObservableProblem";
    for (const key of STOPPING_FACTOR_KEYS) stoppingFactors[key] = key === selectedExclusive;
  }

  // Older browser clients submitted only six category-level Yes/No values.
  // Infer their screening answer so an in-flight save remains compatible with
  // the upgraded server, while new clients send the answer explicitly.
  const inferredFailureObserved = CRITICAL_FLAG_KEYS.some(
    (key) => criticalFlags[key] === "yes",
  )
    ? "yes"
    : CRITICAL_FLAG_KEYS.filter((key) => key !== "otherSeriousFailure").every(
        (key) => criticalFlags[key] === "no",
      )
      ? "no"
      : "";
  const criticalFailureObserved =
    payload.criticalFailureObserved ?? inferredFailureObserved;

  if (criticalFailureObserved === "no") {
    for (const key of CRITICAL_FLAG_KEYS) {
      criticalFlags[key] = "no";
      criticalEvidence[key] = "";
      criticalEvidenceTurns[key] = "";
    }
  } else if (criticalFailureObserved === "cannot_determine") {
    for (const key of CRITICAL_FLAG_KEYS) {
      criticalFlags[key] = null;
      criticalEvidence[key] = "";
      criticalEvidenceTurns[key] = "";
    }
  } else if (criticalFailureObserved === "yes") {
    for (const key of CRITICAL_FLAG_KEYS) {
      if (criticalFlags[key] !== "yes") {
        criticalFlags[key] = "no";
        criticalEvidence[key] = "";
        criticalEvidenceTurns[key] = "";
      }
    }
  }

  return {
    scores,
    evidenceTurns,
    justifications,
    criticalFlags,
    criticalEvidence,
    criticalEvidenceTurns,
    criticalFailureObserved,
    taskStatus: payload.taskStatus ?? "",
    participantBehaviours,
    participantBehaviourEvidenceTurns,
    participantBehaviourOther: participantBehaviours.otherObservableBehaviour
      ? (payload.participantBehaviourOther ?? payload.participantResponseOther)?.trim() ?? ""
      : "",
    participantReactions,
    participantReactionEvidenceTurns,
    participantReactionOther: participantReactions.otherExpressedReaction
      ? payload.participantReactionOther?.trim() || (
          legacyParticipantResponseSource.expressedConfusionOrFrustration === true
            ? "Legacy coding: expressed confusion or frustration (not separable)."
            : ""
        )
      : "",
    episodeEnding: payload.episodeEnding ?? "",
    stoppingFactors,
    stoppingFactorsEvidenceTurns: payload.stoppingFactorsEvidenceTurns?.trim() ?? "",
    stoppingFactorsExplanation: payload.stoppingFactorsExplanation?.trim() ?? "",
    genderContextHandling: payload.genderContextHandling ?? "",
    mostUsefulThing: payload.mostUsefulThing?.trim() ?? "",
    suggestedImprovement: payload.suggestedImprovement?.trim() ?? "",
    skipReason: payload.skipReason?.trim() ?? "",
    comments: payload.comments?.trim() ?? "",
  };
}

/**
 * Applies the submission-only requirements. Drafts may be incomplete, while a
 * completed rating must contain every judgment. Written explanations are
 * required only for selected critical failures; skip reasons are validated
 * separately when the rater uses the skip action.
 */
function completionError(annotation: NormalizedAnnotation): string | null {
  for (const dimension of RUBRIC_DIMENSIONS) {
    const score = annotation.scores[dimension.key];
    if (score === null) return `Select a score or N/A for ${dimension.label}.`;
  }

  if (!annotation.taskStatus) {
    return "Select the task status.";
  }
  if (!PARTICIPANT_BEHAVIOUR_KEYS.some((key) => annotation.participantBehaviours[key])) {
    return "Select at least one observable participant behaviour.";
  }
  if (annotation.participantBehaviours.otherObservableBehaviour && !annotation.participantBehaviourOther) {
    return "Describe the other observable participant behaviour.";
  }
  if (!PARTICIPANT_REACTION_KEYS.some((key) => annotation.participantReactions[key])) {
    return "Select at least one explicitly expressed participant reaction.";
  }
  if (annotation.participantReactions.otherExpressedReaction && !annotation.participantReactionOther) {
    return "Describe the other expressed participant reaction.";
  }
  if (!annotation.episodeEnding) {
    return "Select how the available module episode ended.";
  }
  if (!annotation.criticalFailureObserved) {
    return "Select whether any critical failure was observed.";
  }
  if (annotation.criticalFailureObserved === "yes") {
    const selectedFlags = CRITICAL_FLAGS.filter(
      (flag) => annotation.criticalFlags[flag.key] === "yes",
    );
    if (!selectedFlags.length) {
      return "Select at least one critical-failure category.";
    }
    for (const flag of selectedFlags) {
      if (!annotation.criticalEvidenceTurns[flag.key]) {
        return `Provide evidence turn number(s) for ${flag.label}.`;
      }
      if (!annotation.criticalEvidence[flag.key]) {
        return `Provide a brief explanation for ${flag.label}.`;
      }
    }
  }
  if (!annotation.genderContextHandling) {
    return "Select how gender-related context was handled.";
  }
  return null;
}

/**
 * Project the v12 participant fields into the former combined object.
 *
 * Keeping this compatibility value populated supports older exports and any
 * browser tab that remains open during deployment. New analysis uses the
 * separate behaviour and reaction columns below.
 */
function legacyParticipantResponses(annotation: NormalizedAnnotation): Record<string, boolean> {
  return {
    providedRequestedInformation: annotation.participantBehaviours.providedRequestedInformation,
    attemptedRequestedAction: annotation.participantBehaviours.attemptedRequestedAction,
    usedOrRespondedToOutput: annotation.participantBehaviours.usedOrRespondedToOutput,
    askedFollowUpQuestion: annotation.participantBehaviours.askedFollowUpQuestion,
    correctedOrDisagreed: annotation.participantBehaviours.correctedOrDisagreed,
    expressedSatisfaction: annotation.participantReactions.expressedSatisfaction,
    expressedConfusionOrFrustration:
      annotation.participantReactions.expressedConfusion ||
      annotation.participantReactions.expressedFrustration,
    changedModule: false,
    noFurtherReply: false,
    noClearResponse: annotation.participantBehaviours.noClearBehaviouralResponse,
    cannotDetermine:
      annotation.participantBehaviours.cannotDetermine ||
      annotation.participantReactions.cannotDetermine,
    otherObservableResponse:
      annotation.participantBehaviours.otherObservableBehaviour ||
      annotation.participantReactions.otherExpressedReaction,
  };
}

export async function POST(request: Request) {
  const rater = await getRaterIdentity(request);
  if (!rater) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }
  if (!rater.canRate) {
    return Response.json(
      { error: "Rater status is required to save or submit ratings." },
      { status: 403 },
    );
  }
  if (rater.role !== "admin" && !isAssignedCohort(rater.assignmentCohort)) {
    return Response.json(
      { error: "Your study assignment is pending. Ask an administrator to assign your queue." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as AnnotationPayload;
  const episodeId = payload.episodeId?.trim() ?? "";
  const status = payload.status === "complete" ? "complete" : "draft";
  const annotation = normalizePayload(payload);
  if (!episodeId || !annotation) {
    return Response.json({ error: "The annotation contains invalid values." }, { status: 400 });
  }
  if (payload.action === "skip" && !annotation.skipReason) {
    return Response.json(
      { error: "Enter a reason before skipping this episode." },
      { status: 400 },
    );
  }

  if (status === "complete") {
    const error = completionError(annotation);
    if (error) return Response.json({ error }, { status: 400 });
  }

  const db = getDatabase();
  await ensureNajahSchema(db);
  await ensureBundledDataset(db);
  const episode = await db
    .prepare(`
      SELECT
        episode_id AS "episodeId",
        study_order AS "studyOrder",
        judge_base_assignment AS "judgeBaseAssignment"
      FROM episodes
      WHERE episode_id = ? AND import_batch = ?
    `)
    .bind(episodeId, BUNDLED_DATASET_VERSION)
    .first<{
      episodeId: string;
      studyOrder: number;
      judgeBaseAssignment: JudgeAssignment;
    }>();
  if (!episode) {
    return Response.json({ error: "Episode not found." }, { status: 404 });
  }

  let hasSeriousMismatch = false;
  if (isJudgeCohort(rater.assignmentCohort)) {
    const primaryRatings = await db
      .prepare(`
        SELECT
          scores_json AS "scoresJson",
          task_status AS "taskStatus",
          task_incomplete_reason AS "taskIncompleteReason",
          participant_responses_json AS "participantResponsesJson",
          participant_behaviours_json AS "participantBehavioursJson",
          participant_reactions_json AS "participantReactionsJson",
          module_episode_ending AS "episodeEnding",
          stopping_factors_json AS "stoppingFactorsJson",
          gender_context_handling AS "genderContextHandling",
          critical_failure_observed AS "criticalFailureObserved",
          critical_flags_json AS "criticalFlagsJson"
        FROM rubric_annotations
        WHERE episode_id = ?
          AND status = 'complete'
          AND review_layer = 'primary'
          AND assignment_cohort = ?
        ORDER BY updated_at
      `)
      .bind(episodeId, primaryCohortForOrder(Number(episode.studyOrder)))
      .all<ComparablePrimaryRating>();
    hasSeriousMismatch = summarizePrimaryMismatch(
      primaryRatings.results,
    ).seriousMismatch;
  }

  if (
    rater.role !== "admin" &&
    !assignmentIncludesEpisode(
      rater.assignmentCohort,
      Number(episode.studyOrder),
      episode.judgeBaseAssignment,
      hasSeriousMismatch,
    )
  ) {
    return Response.json(
      { error: "This episode is outside your assigned review queue." },
      { status: 403 },
    );
  }

  const reviewLayer = reviewLayerForAccount(rater.role, rater.assignmentCohort);
  const requiredRatings = await requiredRatingsForAssignment(
    db,
    rater.assignmentCohort,
  );

  // Administrative demo ratings are retained for demonstrations but never
  // consume one of the primary-group or judge-review study slots.
  if (status === "complete" && reviewLayer !== "admin_demo") {
    const completed = await db
      .prepare(`
        SELECT COUNT(*) AS count FROM rubric_annotations
        WHERE episode_id = ?
          AND status = 'complete'
          AND rater_id != ?
          AND review_layer = ?
          AND assignment_cohort = ?
      `)
      .bind(episodeId, rater.id, reviewLayer, rater.assignmentCohort)
      .first<{ count: number }>();
    if ((completed?.count ?? 0) >= requiredRatings) {
      return Response.json(
        {
          error: reviewLayer === "judge"
            ? "Both assigned judges have already completed this episode."
            : "Every active rater in this primary group has already completed this episode.",
        },
        { status: 409 },
      );
    }
  }

  await db
    .prepare(`
      INSERT INTO rubric_annotations (
        episode_id, rater_id, rater_email, review_layer, assignment_cohort,
        scores_json, evidence_turns_json,
        justifications_json, critical_failure_observed, critical_flags_json,
        critical_evidence_json, critical_evidence_turns_json,
        task_status, task_incomplete_reason,
        participant_responses_json, participant_response_other,
        participant_behaviours_json, participant_behaviour_evidence_turns_json,
        participant_behaviour_other, participant_reactions_json,
        participant_reaction_evidence_turns_json, participant_reaction_other,
        module_episode_ending,
        stopping_factors_json, stopping_factors_evidence_turns, stopping_factors_explanation,
        gender_context_handling, most_useful_thing, suggested_improvement,
        skip_reason, comments, rubric_version, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(episode_id, rater_id) DO UPDATE SET
        rater_email = excluded.rater_email,
        review_layer = excluded.review_layer,
        assignment_cohort = excluded.assignment_cohort,
        scores_json = excluded.scores_json,
        evidence_turns_json = excluded.evidence_turns_json,
        justifications_json = excluded.justifications_json,
        critical_failure_observed = excluded.critical_failure_observed,
        critical_flags_json = excluded.critical_flags_json,
        critical_evidence_json = excluded.critical_evidence_json,
        critical_evidence_turns_json = excluded.critical_evidence_turns_json,
        task_status = excluded.task_status,
        task_incomplete_reason = excluded.task_incomplete_reason,
        participant_responses_json = excluded.participant_responses_json,
        participant_response_other = excluded.participant_response_other,
        participant_behaviours_json = excluded.participant_behaviours_json,
        participant_behaviour_evidence_turns_json = excluded.participant_behaviour_evidence_turns_json,
        participant_behaviour_other = excluded.participant_behaviour_other,
        participant_reactions_json = excluded.participant_reactions_json,
        participant_reaction_evidence_turns_json = excluded.participant_reaction_evidence_turns_json,
        participant_reaction_other = excluded.participant_reaction_other,
        module_episode_ending = excluded.module_episode_ending,
        stopping_factors_json = excluded.stopping_factors_json,
        stopping_factors_evidence_turns = excluded.stopping_factors_evidence_turns,
        stopping_factors_explanation = excluded.stopping_factors_explanation,
        gender_context_handling = excluded.gender_context_handling,
        most_useful_thing = excluded.most_useful_thing,
        suggested_improvement = excluded.suggested_improvement,
        skip_reason = excluded.skip_reason,
        comments = excluded.comments,
        rubric_version = excluded.rubric_version,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(
      episodeId,
      rater.id,
      rater.email,
      reviewLayer,
      rater.assignmentCohort,
      JSON.stringify(annotation.scores),
      JSON.stringify(annotation.evidenceTurns),
      JSON.stringify(annotation.justifications),
      annotation.criticalFailureObserved,
      JSON.stringify(annotation.criticalFlags),
      JSON.stringify(annotation.criticalEvidence),
      JSON.stringify(annotation.criticalEvidenceTurns),
      annotation.taskStatus,
      "",
      JSON.stringify(legacyParticipantResponses(annotation)),
      annotation.participantBehaviourOther || annotation.participantReactionOther,
      JSON.stringify(annotation.participantBehaviours),
      JSON.stringify(annotation.participantBehaviourEvidenceTurns),
      annotation.participantBehaviourOther,
      JSON.stringify(annotation.participantReactions),
      JSON.stringify(annotation.participantReactionEvidenceTurns),
      annotation.participantReactionOther,
      annotation.episodeEnding,
      JSON.stringify(annotation.stoppingFactors),
      annotation.stoppingFactorsEvidenceTurns,
      annotation.stoppingFactorsExplanation,
      annotation.genderContextHandling,
      annotation.mostUsefulThing,
      annotation.suggestedImprovement,
      annotation.skipReason,
      annotation.comments,
      RUBRIC_VERSION,
      status,
    )
    .run();

  return Response.json({ ok: true, status, rubricVersion: RUBRIC_VERSION });
}

/**
 * Permanently deletes selected drafts owned by the signed-in rater.
 *
 * Completed ratings are protected by the SQL status condition, and the
 * participant identifiers are always parameter-bound rather than interpolated.
 */
export async function DELETE(request: Request) {
  const rater = await getRaterIdentity(request);
  if (!rater) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }
  if (!rater.canRate) {
    return Response.json(
      { error: "Rater status is required to delete drafts." },
      { status: 403 },
    );
  }

  let body: { episodeIds?: unknown };
  try {
    body = (await request.json()) as { episodeIds?: unknown };
  } catch {
    return Response.json({ error: "Choose one or more drafts to delete." }, { status: 400 });
  }

  if (!Array.isArray(body.episodeIds)) {
    return Response.json({ error: "Choose one or more drafts to delete." }, { status: 400 });
  }
  const episodeIds = Array.from(new Set(body.episodeIds.map((value) => (
    typeof value === "string" ? value.trim() : ""
  ))));
  if (
    !episodeIds.length ||
    episodeIds.length > 300 ||
    episodeIds.some((episodeId) => !episodeId || episodeId.length > 120)
  ) {
    return Response.json({ error: "The draft selection is invalid." }, { status: 400 });
  }

  const db = getDatabase();
  await ensureNajahSchema(db);
  await ensureBundledDataset(db);
  const placeholders = episodeIds.map(() => "?").join(", ");
  const deleted = await db
    .prepare(`
      DELETE FROM rubric_annotations
      WHERE rater_id = ?
        AND status = 'draft'
        AND episode_id IN (
          SELECT episode_id FROM episodes
          WHERE import_batch = ?
            AND episode_id IN (${placeholders})
        )
      RETURNING episode_id AS "episodeId"
    `)
    .bind(rater.id, BUNDLED_DATASET_VERSION, ...episodeIds)
    .all<{ episodeId: string }>();

  return Response.json({
    ok: true,
    deletedCount: deleted.results.length,
    deletedEpisodeIds: deleted.results.map((row) => row.episodeId),
  });
}
