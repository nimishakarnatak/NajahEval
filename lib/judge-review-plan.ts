import plan from "@/data/judge-review-plan.json";

export type JudgeQueueTier = "priority" | "optional";
export type PlannedJudgeAssignment = "judge_1" | "judge_2";
type PossibleAssignment = PlannedJudgeAssignment | string;

type PlanJudge = {
  displayName: string;
  priority: string[];
  optional: string[];
};

const judges = plan.judges as Record<PlannedJudgeAssignment, PlanJudge>;

/** Return the immutable ordered IDs for one judge and one review tier. */
export function judgeTierEpisodeIds(
  assignment: PossibleAssignment,
  tier: JudgeQueueTier,
): readonly string[] {
  if (assignment !== "judge_1" && assignment !== "judge_2") return [];
  return judges[assignment][tier];
}

/** Return all 60 allocated episodes, with the priority tier first. */
export function judgeEpisodeIds(assignment: PossibleAssignment): readonly string[] {
  return [
    ...judgeTierEpisodeIds(assignment, "priority"),
    ...judgeTierEpisodeIds(assignment, "optional"),
  ];
}

/** Identify the tier containing an episode for the specified judge. */
export function judgeQueueTierForEpisode(
  assignment: PossibleAssignment,
  episodeId: string,
): JudgeQueueTier | "" {
  if (judgeTierEpisodeIds(assignment, "priority").includes(episodeId)) return "priority";
  if (judgeTierEpisodeIds(assignment, "optional").includes(episodeId)) return "optional";
  return "";
}

/** Preserve the verified order from the judge allocation workbook. */
export function judgeQueueOrderForEpisode(
  assignment: PossibleAssignment,
  episodeId: string,
): number {
  const ids = judgeEpisodeIds(assignment);
  const index = ids.indexOf(episodeId);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index + 1;
}

/** Resolve the sole assigned judge for a planned episode. */
export function judgeAssignmentForPlannedEpisode(
  episodeId: string,
): PlannedJudgeAssignment | "" {
  for (const assignment of ["judge_1", "judge_2"] as const) {
    if (judgeEpisodeIds(assignment).includes(episodeId)) return assignment;
  }
  return "";
}

/** Build a safe SQL list from fixed application-owned episode identifiers. */
export function judgeEpisodeSqlList(assignment: PossibleAssignment): string {
  const ids = judgeEpisodeIds(assignment);
  if (!ids.length) return "''";
  return ids.map((episodeId) => `'${episodeId}'`).join(", ");
}

export const JUDGE_REVIEW_PLAN_VERSION = plan.version;
