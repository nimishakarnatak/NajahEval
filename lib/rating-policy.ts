/**
 * Number of independent completed evaluations required for every episode.
 *
 * The study currently has five raters and requires all five to evaluate every
 * episode. Keeping this value in one shared module ensures that the rater
 * queue, server-side submission limit, and administrator dashboard all apply
 * the same study design.
 */
export const REQUIRED_RATINGS_PER_EPISODE = 5;
