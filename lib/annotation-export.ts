import { studentStatusLabel, treatmentLabel } from "@/lib/episode-dimensions";
import { CRITICAL_FLAGS, RUBRIC_DIMENSIONS } from "@/lib/rubric";
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
  module: string;
  treatment: string;
  language: string;
  status: string;
  mostUsefulReflection: string;
  improvementReflection: string;
  skipReason: string;
  legacyEpisodeEndReason: string;
  criticalFailureObserved: string;
  scoresJson: string;
  evidenceTurnsJson: string;
  justificationsJson: string;
  criticalFlagsJson: string;
  criticalEvidenceJson: string;
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
    "module",
    "treatment",
    "language",
    "annotation_status",
    "skip_reason",
    "legacy_episode_end_reason",
    "critical_failure_observed",
    ...RUBRIC_DIMENSIONS.flatMap((dimension) => [
      `${dimension.key}_score`,
      `${dimension.key}_evidence_turns`,
      `${dimension.key}_justification`,
    ]),
    ...CRITICAL_FLAGS.flatMap((flag) => [
      `${flag.key}_flag`,
      `${flag.key}_evidence_explanation`,
    ]),
    "most_useful_reflection",
    "improvement_reflection",
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
      row.module,
      treatmentLabel(row.treatment),
      row.language,
      row.status,
      row.skipReason,
      row.legacyEpisodeEndReason,
      row.criticalFailureObserved,
      ...RUBRIC_DIMENSIONS.flatMap((dimension) => [
        scores[dimension.key],
        evidenceTurns[dimension.key],
        justifications[dimension.key],
      ]),
      ...CRITICAL_FLAGS.flatMap((flag) => [
        criticalFlags[flag.key],
        criticalEvidence[flag.key],
      ]),
      row.mostUsefulReflection,
      row.improvementReflection,
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
