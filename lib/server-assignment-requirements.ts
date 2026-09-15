import { getDatabase } from "@/db";
import {
  REQUIRED_JUDGE_RATINGS_PER_EPISODE,
  REQUIRED_PRIMARY_RATINGS_PER_EPISODE,
} from "@/lib/rating-policy";
import {
  isJudgeCohort,
  isPrimaryCohort,
  type AssignmentCohort,
} from "@/lib/study-assignments";

/**
 * Return the number of completed ratings expected for each episode in a queue.
 *
 * Primary groups have no fixed membership limit. Every active rater assigned to
 * the group is expected to review its 100 episodes, while the study retains a
 * minimum of two independent primary ratings. Each judge queue has two active
 * places and therefore requires two independent judge reviews.
 */
export async function requiredRatingsForAssignment(
  db: ReturnType<typeof getDatabase>,
  assignment: AssignmentCohort,
): Promise<number> {
  if (isJudgeCohort(assignment)) return REQUIRED_JUDGE_RATINGS_PER_EPISODE;
  if (!isPrimaryCohort(assignment)) return REQUIRED_PRIMARY_RATINGS_PER_EPISODE;

  const row = await db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM users
      WHERE is_active = TRUE
        AND can_rate = TRUE
        AND assignment_cohort = ?
    `)
    .bind(assignment)
    .first<{ count: number | string }>();

  return Math.max(
    Number(row?.count ?? 0),
    REQUIRED_PRIMARY_RATINGS_PER_EPISODE,
  );
}
