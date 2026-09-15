import {
  CRITICAL_FLAG_KEYS,
  DIMENSION_KEYS,
  type CriticalFailureObserved,
  type CriticalFlagValue,
  type DimensionScore,
} from "@/lib/rubric";

export type ComparablePrimaryRating = {
  scoresJson: string;
  taskStatus: string;
  taskIncompleteReason: string;
  participantResponsesJson: string;
  episodeEnding: string;
  stoppingFactorsJson: string;
  genderContextHandling: string;
  criticalFailureObserved: string;
  criticalFlagsJson: string;
};

export type PrimaryMismatchSummary = {
  ratingCount: number;
  mismatch: boolean;
  seriousMismatch: boolean;
};

/** Parse a stored keyed JSON value without allowing malformed legacy data to fail a queue. */
function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

/** Return the supported score representation used for mismatch comparisons. */
function scoreValue(value: unknown): DimensionScore {
  return value === 1 || value === 2 || value === 3 || value === "na" ? value : null;
}

/** Return the supported critical-flag representation used for comparisons. */
function flagValue(value: unknown): CriticalFlagValue {
  return value === "yes" || value === "no" ? value : null;
}

/**
 * Compare completed primary ratings without disclosing their values.
 *
 * An ordinary mismatch means any selected score or categorical judgment
 * differs. A serious mismatch is deliberately narrower: a 1-versus-3 score,
 * N/A-versus-substantive score, different task-status/end-reason judgment, or
 * different critical-failure screening/category judgment. Serious mismatches
 * can add an episode to a judge's workload; ordinary mismatches are alerts only
 * when the episode is already in that judge's base sample.
 */
export function summarizePrimaryMismatch(
  ratings: ComparablePrimaryRating[],
): PrimaryMismatchSummary {
  if (ratings.length < 2) {
    return { ratingCount: ratings.length, mismatch: false, seriousMismatch: false };
  }

  const normalized = ratings.slice(0, 2).map((rating) => {
    const scores = parseObject(rating.scoresJson);
    const flags = parseObject(rating.criticalFlagsJson);
    const participantResponses = parseObject(rating.participantResponsesJson);
    const stoppingFactors = parseObject(rating.stoppingFactorsJson);
    return {
      scores: Object.fromEntries(
        DIMENSION_KEYS.map((key) => [key, scoreValue(scores[key])]),
      ) as Record<(typeof DIMENSION_KEYS)[number], DimensionScore>,
      flags: Object.fromEntries(
        CRITICAL_FLAG_KEYS.map((key) => [key, flagValue(flags[key])]),
      ) as Record<(typeof CRITICAL_FLAG_KEYS)[number], CriticalFlagValue>,
      taskStatus: rating.taskStatus || "",
      taskIncompleteReason: rating.taskIncompleteReason || "",
      participantResponses,
      episodeEnding: rating.episodeEnding || "",
      stoppingFactors,
      genderContextHandling: rating.genderContextHandling || "",
      criticalFailureObserved:
        rating.criticalFailureObserved as CriticalFailureObserved | "",
    };
  });
  const [left, right] = normalized;

  const taskMismatch =
    left.taskStatus !== right.taskStatus ||
    left.taskIncompleteReason !== right.taskIncompleteReason ||
    left.episodeEnding !== right.episodeEnding ||
    left.genderContextHandling !== right.genderContextHandling;
  const participantResponseMismatch =
    JSON.stringify(left.participantResponses) !== JSON.stringify(right.participantResponses);
  const stoppingFactorMismatch =
    JSON.stringify(left.stoppingFactors) !== JSON.stringify(right.stoppingFactors);
  const criticalMismatch =
    left.criticalFailureObserved !== right.criticalFailureObserved ||
    CRITICAL_FLAG_KEYS.some((key) => left.flags[key] !== right.flags[key]);
  const scoreMismatch = DIMENSION_KEYS.some(
    (key) => left.scores[key] !== right.scores[key],
  );
  const seriousScoreMismatch = DIMENSION_KEYS.some((key) => {
    const values = new Set([left.scores[key], right.scores[key]]);
    const oneVersusThree = values.has(1) && values.has(3);
    const naVersusSubstantive =
      values.has("na") && (values.has(1) || values.has(2) || values.has(3));
    return oneVersusThree || naVersusSubstantive;
  });

  return {
    ratingCount: ratings.length,
    mismatch: scoreMismatch || taskMismatch || participantResponseMismatch || stoppingFactorMismatch || criticalMismatch,
    seriousMismatch: seriousScoreMismatch || taskMismatch || criticalMismatch,
  };
}
