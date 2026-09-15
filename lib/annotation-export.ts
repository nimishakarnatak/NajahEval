import { studentStatusLabel, treatmentLabel } from "@/lib/episode-dimensions";
import {
  CRITICAL_FLAGS,
  PARTICIPANT_BEHAVIOURS,
  PARTICIPANT_REACTIONS,
  RUBRIC_DIMENSIONS,
} from "@/lib/rubric";
import { primaryCohortForOrder } from "@/lib/study-assignments";

export type ExportAnnotationRow = {
  raterId: string;
  raterName: string;
  raterEmail: string;
  raterRole: string;
  raterCanRate: boolean;
  raterCurrentAssignment: string;
  reviewLayer: string;
  assignmentCohort: string;
  episodeId: string;
  studyOrder: number;
  judgeBaseAssignment: string;
  studentStatus: string;
  participantGender: string;
  activityGroup: string;
  samplingWeight: number | string | null;
  participantSamplingProbability: number | string | null;
  focalEpisodeSelectionProbability: number | string | null;
  combinedEpisodeInclusionProbability: number | string | null;
  module: string;
  treatment: string;
  language: string;
  status: string;
  taskStatus: string;
  taskIncompleteReason: string;
  participantResponsesJson: string;
  participantResponseOther: string;
  participantBehavioursJson: string;
  participantBehaviourEvidenceTurnsJson: string;
  participantBehaviourOther: string;
  participantReactionsJson: string;
  participantReactionEvidenceTurnsJson: string;
  participantReactionOther: string;
  episodeEnding: string;
  genderContextHandling: string;
  mostUsefulThing: string;
  suggestedImprovement: string;
  skipReason: string;
  legacyEpisodeEndReason: string;
  criticalFailureObserved: string;
  scoresJson: string;
  evidenceTurnsJson: string;
  justificationsJson: string;
  criticalFlagsJson: string;
  criticalEvidenceJson: string;
  criticalEvidenceTurnsJson: string;
  comments: string;
  rubricVersion: string;
  updatedAt: string | Date;
};

/** Recover a keyed JSON object while tolerating malformed legacy values. */
function keyedValues(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Keep earlier task-outcome answers usable without exposing an ambiguous
 * `legacy_episode_end_reason` column in analysis exports.
 */
function exportedTaskOutcome(row: ExportAnnotationRow): string {
  if (row.taskStatus) return row.taskStatus;

  if (row.legacyEpisodeEndReason === "output_delivered_unconfirmed") {
    return "output_delivered_confirmation_not_observed";
  }
  if (row.legacyEpisodeEndReason === "task_completed") {
    return "task_completed_under_previous_rubric";
  }
  if (row.legacyEpisodeEndReason === "cannot_determine") {
    return "cannot_determine";
  }
  return "";
}

/**
 * Return the current episode-ending answer, with a conservative fallback for
 * earlier fields that described an observable ending rather than task status.
 */
function exportedEpisodeEnding(row: ExportAnnotationRow): string {
  if (row.episodeEnding) return row.episodeEnding;

  const previousAnswer = row.taskIncompleteReason || row.legacyEpisodeEndReason;
  const endingMap: Record<string, string> = {
    no_further_participant_reply_observed: "no_further_participant_reply",
    no_further_najah_reply_observed: "no_further_najah_reply",
    participant_moved_module: "participant_moved_module",
    technical_failure: "technical_failure",
    other_or_unclear: "no_clear_boundary",
    no_further_participant_reply: "no_further_participant_reply",
    no_further_najah_reply: "no_further_najah_reply",
    system_or_technical_failure: "technical_failure",
    output_delivered_unconfirmed: "intended_output_delivered",
    task_completed: "intended_output_delivered",
    cannot_determine: "cannot_determine",
  };
  return endingMap[previousAnswer] ?? "";
}

/**
 * Escape one CSV cell and neutralize spreadsheet-formula prefixes.
 *
 * Rater comments and evidence are free text. Prefixing formula-like values with
 * an apostrophe prevents Excel or Google Sheets from executing them as formulas
 * when an administrator opens an export.
 */
function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Build an analysis-ready CSV from saved rubric annotations. */
export function annotationExportCsv(rows: ExportAnnotationRow[]): string {
  const columns = [
    "rater_id",
    "rater_name",
    "rater_email",
    "rater_role",
    "rater_status_active",
    "rater_current_assignment",
    "review_layer",
    "rating_assignment_cohort",
    "episode_id",
    "study_order",
    "primary_group",
    "judge_base_assignment",
    "student_status",
    "participant_gender",
    "activity_group",
    "sampling_weight",
    "participant_sampling_probability",
    "focal_episode_selection_probability",
    "combined_episode_inclusion_probability",
    "module",
    "treatment",
    "language",
    "annotation_status",
    "task_outcome",
    ...PARTICIPANT_BEHAVIOURS.map((behaviour) => `participant_behaviour_${behaviour.key}`),
    "participant_behaviour_other",
    ...PARTICIPANT_REACTIONS.map((reaction) => `participant_reaction_${reaction.key}`),
    "participant_reaction_other",
    "episode_ending",
    "gender_context_handling",
    "most_useful_thing",
    "suggested_improvement",
    "skip_reason",
    "critical_failure_observed",
    ...RUBRIC_DIMENSIONS.flatMap((dimension) => [
      `${dimension.key}_score`,
      `${dimension.key}_evidence_turns`,
      ...(dimension.key === "routing" ? ["routing_na_reason"] : []),
    ]),
    ...CRITICAL_FLAGS.flatMap((flag) => [
      `${flag.key}_flag`,
      `${flag.key}_evidence_turns`,
      `${flag.key}_evidence_explanation`,
    ]),
    "comments",
    "rubric_version",
    "updated_at",
  ];

  const values = rows.map((row) => {
    const scores = keyedValues(row.scoresJson);
    const evidenceTurns = keyedValues(row.evidenceTurnsJson);
    const justifications = keyedValues(row.justificationsJson);
    const criticalFlags = keyedValues(row.criticalFlagsJson);
    const criticalEvidence = keyedValues(row.criticalEvidenceJson);
    const criticalEvidenceTurns = keyedValues(row.criticalEvidenceTurnsJson);
    const participantBehaviours = keyedValues(row.participantBehavioursJson);
    const participantReactions = keyedValues(row.participantReactionsJson);
    const legacyParticipantResponses = keyedValues(row.participantResponsesJson);
    let participantBehaviourOther = row.participantBehaviourOther;
    let participantReactionOther = row.participantReactionOther;

    // Make pre-v12 ratings legible in current exports without rewriting their
    // original database row. The former combined confusion/frustration option
    // is retained explicitly as a legacy value rather than guessed apart.
    if (
      !Object.values(participantBehaviours).some((value) => value === true) &&
      !Object.values(participantReactions).some((value) => value === true)
    ) {
      for (const key of [
        "providedRequestedInformation",
        "attemptedRequestedAction",
        "usedOrRespondedToOutput",
        "askedFollowUpQuestion",
        "correctedOrDisagreed",
      ]) participantBehaviours[key] = legacyParticipantResponses[key] === true;
      participantBehaviours.otherObservableBehaviour = legacyParticipantResponses.otherObservableResponse === true;
      participantBehaviours.noClearBehaviouralResponse = legacyParticipantResponses.noClearResponse === true;
      participantBehaviours.cannotDetermine = legacyParticipantResponses.cannotDetermine === true;
      participantReactions.expressedSatisfaction = legacyParticipantResponses.expressedSatisfaction === true;
      if (legacyParticipantResponses.expressedConfusionOrFrustration === true) {
        participantReactions.otherExpressedReaction = true;
        participantReactionOther = "Legacy coding: expressed confusion or frustration (not separable).";
      }
      if (legacyParticipantResponses.otherObservableResponse === true && !participantBehaviourOther) {
        participantBehaviourOther = row.participantResponseOther;
      }
      if (!Object.values(participantReactions).some((value) => value === true)) {
        participantReactions.noExplicitReaction = true;
      }
    }
    return [
      row.raterId,
      row.raterName,
      row.raterEmail,
      row.raterRole,
      row.raterCanRate,
      row.raterCurrentAssignment,
      row.reviewLayer,
      row.assignmentCohort,
      row.episodeId,
      row.studyOrder,
      primaryCohortForOrder(Number(row.studyOrder)),
      row.judgeBaseAssignment,
      studentStatusLabel(row.studentStatus),
      row.participantGender,
      row.activityGroup,
      row.samplingWeight,
      row.participantSamplingProbability,
      row.focalEpisodeSelectionProbability,
      row.combinedEpisodeInclusionProbability,
      row.module,
      treatmentLabel(row.treatment),
      row.language,
      row.status,
      exportedTaskOutcome(row),
      ...PARTICIPANT_BEHAVIOURS.map((behaviour) => participantBehaviours[behaviour.key]),
      participantBehaviourOther,
      ...PARTICIPANT_REACTIONS.map((reaction) => participantReactions[reaction.key]),
      participantReactionOther,
      exportedEpisodeEnding(row),
      row.genderContextHandling,
      row.mostUsefulThing,
      row.suggestedImprovement,
      row.skipReason,
      row.criticalFailureObserved,
      ...RUBRIC_DIMENSIONS.flatMap((dimension) => [
        scores[dimension.key],
        evidenceTurns[dimension.key],
        ...(dimension.key === "routing" ? [justifications.routing] : []),
      ]),
      ...CRITICAL_FLAGS.flatMap((flag) => [
        criticalFlags[flag.key],
        criticalEvidenceTurns[flag.key],
        criticalEvidence[flag.key],
      ]),
      row.comments,
      row.rubricVersion,
      row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    ];
  });

  return [columns, ...values].map((row) => row.map(csvCell).join(",")).join("\n");
}

/** Convert a display name into a short filename-safe identifier. */
export function exportFilenamePart(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return normalized || "rater";
}
