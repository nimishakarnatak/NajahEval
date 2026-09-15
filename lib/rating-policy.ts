/**
 * Number of independent completed primary evaluations required per episode.
 *
 * This is the minimum reliability threshold. When a primary group contains
 * more than two active raters, every assigned rater is expected to complete it.
 */
export const REQUIRED_PRIMARY_RATINGS_PER_EPISODE = 2;

/** Every assigned judge episode receives two independent quality-assurance reviews. */
export const REQUIRED_JUDGE_RATINGS_PER_EPISODE = 2;
