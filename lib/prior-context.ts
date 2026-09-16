export const NO_PRIOR_CONTEXT_MESSAGE =
  "No earlier module chat was available before this module episode in the participant's exported Najah history.";

export const NO_SUBSEQUENT_CONTEXT_MESSAGE =
  "No subsequent module chat was available after this module episode in the participant's exported Najah history.";

export function priorContextOrExplanation(value?: string | null): string {
  return value?.trim() || NO_PRIOR_CONTEXT_MESSAGE;
}

export function subsequentContextOrExplanation(value?: string | null): string {
  return value?.trim() || NO_SUBSEQUENT_CONTEXT_MESSAGE;
}
