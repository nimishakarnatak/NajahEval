import type { UserRole } from "@/lib/user-roles";

/** Stable assignment identifiers stored with users and rating records. */
export const ASSIGNMENT_COHORTS = [
  "unassigned",
  "group_a",
  "group_b",
  "group_c",
  "judge_1",
  "judge_2",
] as const;

export type AssignmentCohort = (typeof ASSIGNMENT_COHORTS)[number];
export type AssignedCohort = Exclude<AssignmentCohort, "unassigned">;
export type ReviewLayer = "primary" | "judge" | "admin_demo" | "legacy";
export type JudgeAssignment = "" | "judge_1" | "judge_2";

export const ASSIGNMENT_OPTIONS: readonly {
  value: AssignedCohort;
  label: string;
  description: string;
  episodeCount: number;
  capacity: number | null;
}[] = [
  {
    value: "group_a",
    label: "Group A · Primary rater",
    description: "The same 100 episodes assigned to every Group A rater.",
    episodeCount: 100,
    capacity: null,
  },
  {
    value: "group_b",
    label: "Group B · Primary rater",
    description: "The same 100 episodes assigned to every Group B rater.",
    episodeCount: 100,
    capacity: null,
  },
  {
    value: "group_c",
    label: "Group C · Primary rater",
    description: "The same 100 episodes assigned to every Group C rater.",
    episodeCount: 100,
    capacity: null,
  },
  {
    value: "judge_1",
    label: "Judge 1",
    description: "A seeded random sample of 50 episodes plus assigned serious mismatches.",
    episodeCount: 50,
    capacity: 1,
  },
  {
    value: "judge_2",
    label: "Judge 2",
    description: "A separate seeded random sample of 50 episodes plus assigned serious mismatches.",
    episodeCount: 50,
    capacity: 1,
  },
];

/** Return true only for a recognized persisted assignment identifier. */
export function isAssignmentCohort(value: unknown): value is AssignmentCohort {
  return ASSIGNMENT_COHORTS.some((cohort) => cohort === value);
}

/** Return true only when the account has a concrete rating assignment. */
export function isAssignedCohort(value: AssignmentCohort): value is AssignedCohort {
  return value !== "unassigned";
}

export function isPrimaryCohort(
  value: AssignmentCohort,
): value is "group_a" | "group_b" | "group_c" {
  return value === "group_a" || value === "group_b" || value === "group_c";
}

export function isJudgeCohort(
  value: AssignmentCohort,
): value is "judge_1" | "judge_2" {
  return value === "judge_1" || value === "judge_2";
}

/** Human-readable assignment used in the rater header, admin table, and CSV. */
export function assignmentCohortLabel(value: AssignmentCohort): string {
  return ASSIGNMENT_OPTIONS.find((option) => option.value === value)?.label ?? "Pending assignment";
}

/** Number of episodes in the queue belonging to one concrete assignment. */
export function assignmentEpisodeCount(value: AssignmentCohort): number {
  return ASSIGNMENT_OPTIONS.find((option) => option.value === value)?.episodeCount ?? 0;
}

/** Maximum active accounts permitted, or null when the group has no fixed limit. */
export function assignmentCapacity(value: AssignmentCohort): number | null {
  return ASSIGNMENT_OPTIONS.find((option) => option.value === value)?.capacity ?? null;
}

/**
 * Resolve the analytic layer captured with a saved rating. Administrator demo
 * ratings remain separate from the study's primary and judge results.
 */
export function reviewLayerForAccount(
  role: UserRole,
  assignment: AssignmentCohort,
): ReviewLayer {
  if (role === "admin") return "admin_demo";
  if (isPrimaryCohort(assignment)) return "primary";
  if (isJudgeCohort(assignment)) return "judge";
  return "legacy";
}

/** Assign each ordered episode to one of the three 100-episode primary batches. */
export function primaryCohortForOrder(order: number): AssignmentCohort {
  if (order >= 1 && order <= 100) return "group_a";
  if (order <= 200) return "group_b";
  if (order <= 300) return "group_c";
  return "unassigned";
}

/** Confirm that a primary rater may see a particular ordered episode. */
export function assignmentIncludesOrder(
  assignment: AssignmentCohort,
  order: number,
): boolean {
  if (isPrimaryCohort(assignment)) return primaryCohortForOrder(order) === assignment;
  return false;
}

/**
 * Resolve the one judge responsible for an episode.
 *
 * The fixed base sample always takes precedence. A serious disagreement that
 * falls outside both base samples is assigned by study-order parity. This rule
 * is deterministic, keeps the two additional queues approximately balanced,
 * and never exposes the same episode to both judges.
 */
export function judgeAssignmentForEpisode(
  baseAssignment: JudgeAssignment,
  order: number,
  hasSeriousMismatch: boolean,
): JudgeAssignment {
  if (baseAssignment) return baseAssignment;
  if (!hasSeriousMismatch || order < 1 || order > 300) return "";
  return order % 2 === 1 ? "judge_1" : "judge_2";
}

/** Confirm that a rater may access an episode under the current study design. */
export function assignmentIncludesEpisode(
  assignment: AssignmentCohort,
  order: number,
  judgeBaseAssignment: JudgeAssignment,
  hasSeriousMismatch: boolean,
): boolean {
  if (isPrimaryCohort(assignment)) {
    return primaryCohortForOrder(order) === assignment;
  }
  if (isJudgeCohort(assignment)) {
    return judgeAssignmentForEpisode(
      judgeBaseAssignment,
      order,
      hasSeriousMismatch,
    ) === assignment;
  }
  return false;
}
