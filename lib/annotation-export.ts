import { studentStatusLabel, treatmentLabel } from "@/lib/episode-dimensions";
import { CRITICAL_FLAGS, RUBRIC_DIMENSIONS } from "@/lib/rubric";

export type ExportAnnotationRow = {
  raterId: string;
  raterName: string;
  raterEmail: string;
  raterRole: string;
  raterCanRate: boolean;
  episodeId: string;
  studentStatus: string;
  module: string;
  treatment: string;
  language: string;
  status: string;
  taskStatus: string;
  taskIncompleteReason: string;
  legacyEpisodeEndReason: string;
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
    "episode_id",
    "student_status",
    "module",
    "treatment",
    "language",
    "annotation_status",
    "task_status",
    "task_incomplete_reason",
    "legacy_episode_end_reason",
    ...RUBRIC_DIMENSIONS.flatMap((dimension) => [
      `${dimension.key}_score`,
      `${dimension.key}_evidence_turns`,
      `${dimension.key}_justification`,
    ]),
    ...CRITICAL_FLAGS.flatMap((flag) => [
      `${flag.key}_flag`,
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

    return [
      row.raterId,
      row.raterName,
      row.raterEmail,
      row.raterRole,
      row.raterCanRate,
      row.episodeId,
      studentStatusLabel(row.studentStatus),
      row.module,
      treatmentLabel(row.treatment),
      row.language,
      row.status,
      row.taskStatus,
      row.taskIncompleteReason,
      row.legacyEpisodeEndReason,
      ...RUBRIC_DIMENSIONS.flatMap((dimension) => [
        scores[dimension.key],
        evidenceTurns[dimension.key],
        justifications[dimension.key],
      ]),
      ...CRITICAL_FLAGS.flatMap((flag) => [
        criticalFlags[flag.key],
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
