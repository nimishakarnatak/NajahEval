/**
 * Number of independent completed primary evaluations required per episode.
 *
 * Each of the three 100-episode batches is assigned to a pair of raters.
 */
export const REQUIRED_PRIMARY_RATINGS_PER_EPISODE = 2;

/** Every episode receives one separate quality-assurance judge review. */
export const REQUIRED_JUDGE_RATINGS_PER_EPISODE = 1;
