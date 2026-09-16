export const NO_PRIOR_CONTEXT_MESSAGE =
  "No earlier substantive participant–Najah messages were available before this module episode.";

export const NO_SUBSEQUENT_CONTEXT_MESSAGE =
  "No later substantive participant–Najah messages were available after this module episode.";

export function priorContextOrExplanation(value?: string | null): string {
  return value?.trim() || NO_PRIOR_CONTEXT_MESSAGE;
}

export function subsequentContextOrExplanation(value?: string | null): string {
  return value?.trim() || NO_SUBSEQUENT_CONTEXT_MESSAGE;
}
