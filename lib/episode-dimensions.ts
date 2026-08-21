export const STUDENT_STATUS_VALUES = ["graduated_student", "current_student"] as const;
export type StudentStatus = (typeof STUDENT_STATUS_VALUES)[number] | "unknown";

export const TREATMENT_VALUES = ["standard", "gender_sensitive"] as const;
export type TreatmentAssignment = (typeof TREATMENT_VALUES)[number] | "unknown";

/**
 * Converts participant-status labels from Najah exports into the two values
 * used by the annotation interface.
 *
 * The source engagement export currently codes current students as `group1`
 * and graduated students as `group2`. Explicit human-readable labels are also
 * accepted so a later export can use `student_status` without preserving those
 * legacy group codes. Missing or unfamiliar values remain `unknown`; they are
 * never guessed from the conversation text.
 */
export function normalizeStudentStatus(value: unknown): StudentStatus {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");

  if (
    normalized.includes("group1") ||
    ["current", "current_student", "student", "enrolled_student"].includes(normalized)
  ) {
    return "current_student";
  }
  if (
    normalized.includes("group2") ||
    ["graduated", "graduate", "graduated_student", "graduate_student", "alumni"].includes(normalized)
  ) {
    return "graduated_student";
  }
  return "unknown";
}

/**
 * Normalizes Najah treatment labels for display and analysis.
 *
 * `not-gender-sensitive` is checked before `gender-sensitive` because the
 * former contains the latter as a substring. The normalized values are stable
 * machine-readable codes; `treatmentLabel` supplies the annotator-facing text.
 */
export function normalizeTreatment(value: unknown): TreatmentAssignment {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (
    normalized.includes("not-gender-sensitive") ||
    normalized.includes("not gender sensitive") ||
    ["standard", "control", "business_as_usual"].includes(normalized.replaceAll(" ", "_"))
  ) {
    return "standard";
  }
  if (
    normalized.includes("gender-sensitive") ||
    normalized.includes("gender sensitive") ||
    normalized.replaceAll("-", "_").replaceAll(" ", "_") === "gender_sensitive"
  ) {
    return "gender_sensitive";
  }
  return "unknown";
}

/** Returns the participant-status text shown in filters, badges, and exports. */
export function studentStatusLabel(status: string): string {
  if (status === "graduated_student") return "Graduated student";
  if (status === "current_student") return "Current student";
  return "Status not supplied";
}

/** Returns the treatment-assignment text shown in filters, badges, and exports. */
export function treatmentLabel(treatment: string): string {
  if (treatment === "standard") return "Standard";
  if (treatment === "gender_sensitive") return "Gender-sensitive";
  return "Treatment not supplied";
}
