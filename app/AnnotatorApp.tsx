"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TREATMENT_VALUES,
  studentStatusLabel,
  treatmentLabel,
} from "@/lib/episode-dimensions";
import {
  CRITICAL_FLAGS,
  CRITICAL_FAILURE_OBSERVATIONS,
  CRITICAL_FLAG_KEYS,
  CriticalFailureObserved,
  CriticalFlagKey,
  CriticalFlagValue,
  DIMENSION_KEYS,
  DimensionKey,
  DimensionScore,
  EPISODE_ENDINGS,
  EpisodeEnding,
  GENDER_CONTEXT_OPTIONS,
  GenderContextHandling,
  PARTICIPANT_BEHAVIOURS,
  PARTICIPANT_BEHAVIOUR_KEYS,
  ParticipantBehaviourGroup,
  ParticipantBehaviourKey,
  PARTICIPANT_REACTIONS,
  PARTICIPANT_REACTION_KEYS,
  ParticipantReactionKey,
  RUBRIC_DIMENSIONS,
  RubricDimension,
  RubricSection,
  STOPPING_FACTOR_KEYS,
  StoppingFactorKey,
  TASK_STATUSES,
  TaskStatus,
  keyedRecord,
} from "@/lib/rubric";
import {
  REQUIRED_PRIMARY_RATINGS_PER_EPISODE,
} from "@/lib/rating-policy";
import { priorContextOrExplanation } from "@/lib/prior-context";
import {
  assignmentCohortLabel,
  isAssignedCohort,
  type AssignmentCohort,
  type ReviewLayer,
} from "@/lib/study-assignments";
import { type UserRole, userAccessLabel } from "@/lib/user-roles";

type AnnotationDraft = {
  scores: Record<DimensionKey, DimensionScore>;
  evidenceTurns: Record<DimensionKey, string>;
  justifications: Record<DimensionKey, string>;
  criticalFlags: Record<CriticalFlagKey, CriticalFlagValue>;
  criticalEvidence: Record<CriticalFlagKey, string>;
  criticalEvidenceTurns: Record<CriticalFlagKey, string>;
  criticalFailureObserved: CriticalFailureObserved | "";
  taskStatus: TaskStatus | "";
  participantBehaviours: Record<ParticipantBehaviourKey, boolean>;
  participantBehaviourEvidenceTurns: Record<ParticipantBehaviourKey, string>;
  participantBehaviourOther: string;
  participantReactions: Record<ParticipantReactionKey, boolean>;
  participantReactionEvidenceTurns: Record<ParticipantReactionKey, string>;
  participantReactionOther: string;
  episodeEnding: EpisodeEnding | "";
  stoppingFactors: Record<StoppingFactorKey, boolean>;
  stoppingFactorsEvidenceTurns: string;
  stoppingFactorsExplanation: string;
  genderContextHandling: GenderContextHandling | "";
  mostUsefulThing: string;
  suggestedImprovement: string;
  skipReason: string;
  comments: string;
};

type Episode = AnnotationDraft & {
  episodeId: string;
  studyOrder: number;
  judgeBaseAssignment: "" | "judge_1" | "judge_2";
  studentStatus: string;
  language: string;
  module: string;
  treatment: string;
  moduleObjective: string;
  priorContext: string;
  transcript: string;
  languageReviewStatus: string;
  primaryRatingCount: number;
  primaryMismatch: boolean;
  primarySeriousMismatch: boolean;
  completedRaterCount: number;
  annotationStatus: "draft" | "complete" | null;
  annotationUpdatedAt: string | null;
  legacyEpisodeEndReason: string;
};

type Rater = {
  displayName: string;
  email: string;
  role: UserRole;
  canRate: boolean;
  assignmentCohort: AssignmentCohort;
};
type SaveState = "saved" | "saving" | "unsaved" | "error";
type ViewFilter = "queue" | "drafts" | "completed" | "mismatches" | "all";
type ProgressView = "queue" | "random" | "not_started" | "draft" | "complete" | "mismatches" | "all";
type TranslationStatus = "idle" | "preparing" | "translating" | "ready" | "error";
type TranscriptTurn = {
  speaker: "USER" | "NAJAH";
  text: string;
  turn: string;
  translationState?: "translated" | "already_english" | "unavailable";
};
type EpisodeTranslation = {
  transcriptTurns: TranscriptTurn[];
  priorContext: string;
  unavailableCount: number;
};
type SubmissionProblem = { message: string; targetId: string };
type DraftDeleteRequest = {
  episodeIds: string[];
  label: string;
};

type BrowserTranslator = {
  translate: (text: string) => Promise<string>;
  destroy?: () => void;
};

type BrowserTranslatorFactory = {
  availability?: (options: {
    sourceLanguage: string;
    targetLanguage: string;
  }) => Promise<"unavailable" | "downloadable" | "downloading" | "available">;
  create: (options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: {
      addEventListener: (
        type: "downloadprogress",
        listener: (event: { loaded: number }) => void,
      ) => void;
    }) => void;
  }) => Promise<BrowserTranslator>;
};

const RUBRIC_SECTIONS: readonly RubricSection[] = [
  "Najah response-quality",
  "Whole module-episode",
];

const MODULE_LABELS: Record<string, string> = {
  cv_building: "CV building",
  job_search_strategy: "Job-search strategy",
  job_opportunities: "Job opportunities",
  interview_preparation: "Interview preparation",
  networking: "Networking",
  offer_review: "Offer review",
  onboarding: "First days at work",
};

/** Creates an independent blank draft so no episode shares nested state. */
function emptyDraft(): AnnotationDraft {
  return {
    scores: keyedRecord(DIMENSION_KEYS, () => null),
    evidenceTurns: keyedRecord(DIMENSION_KEYS, () => ""),
    justifications: keyedRecord(DIMENSION_KEYS, () => ""),
    criticalFlags: keyedRecord(CRITICAL_FLAG_KEYS, () => null),
    criticalEvidence: keyedRecord(CRITICAL_FLAG_KEYS, () => ""),
    criticalEvidenceTurns: keyedRecord(CRITICAL_FLAG_KEYS, () => ""),
    criticalFailureObserved: "",
    taskStatus: "",
    participantBehaviours: keyedRecord(PARTICIPANT_BEHAVIOUR_KEYS, () => false),
    participantBehaviourEvidenceTurns: keyedRecord(PARTICIPANT_BEHAVIOUR_KEYS, () => ""),
    participantBehaviourOther: "",
    participantReactions: keyedRecord(PARTICIPANT_REACTION_KEYS, () => false),
    participantReactionEvidenceTurns: keyedRecord(PARTICIPANT_REACTION_KEYS, () => ""),
    participantReactionOther: "",
    episodeEnding: "",
    stoppingFactors: keyedRecord(STOPPING_FACTOR_KEYS, () => false),
    stoppingFactorsEvidenceTurns: "",
    stoppingFactorsExplanation: "",
    genderContextHandling: "",
    mostUsefulThing: "",
    suggestedImprovement: "",
    skipReason: "",
    comments: "",
  };
}

/**
 * Finds the first requirement that prevents a draft from being submitted.
 *
 * This mirrors the server-side completion rules so the rater receives useful
 * feedback before a request is sent. The target ID lets the long, independently
 * scrolling rating panel reveal the exact field that needs attention.
 */
function firstSubmissionProblem(draft: AnnotationDraft): SubmissionProblem | null {
  for (const dimension of RUBRIC_DIMENSIONS) {
    const score = draft.scores[dimension.key];
    if (score === null) {
      return {
        message: `Select a score or N/A for ${dimension.label}.`,
        targetId: `rating-${dimension.key}`,
      };
    }
  }

  if (!draft.taskStatus) {
    return {
      message: "Select the task status.",
      targetId: "task-status",
    };
  }

  if (!PARTICIPANT_BEHAVIOUR_KEYS.some((key) => draft.participantBehaviours[key])) {
    return {
      message: "Select at least one observable participant behaviour.",
      targetId: "participant-behaviour",
    };
  }
  if (draft.participantBehaviours.otherObservableBehaviour && !draft.participantBehaviourOther.trim()) {
    return {
      message: "Describe the other observable participant behaviour.",
      targetId: "participant-behaviour-other",
    };
  }
  if (!PARTICIPANT_REACTION_KEYS.some((key) => draft.participantReactions[key])) {
    return {
      message: "Select at least one explicitly expressed participant reaction.",
      targetId: "participant-reaction",
    };
  }
  if (draft.participantReactions.otherExpressedReaction && !draft.participantReactionOther.trim()) {
    return {
      message: "Describe the other expressed participant reaction.",
      targetId: "participant-reaction-other",
    };
  }
  if (!draft.episodeEnding) {
    return { message: "Select how the available module episode ended.", targetId: "episode-ending" };
  }
  if (!draft.criticalFailureObserved) {
    return {
      message: "Select whether any critical failure was observed.",
      targetId: "critical-failure-observed",
    };
  }

  if (draft.criticalFailureObserved === "yes") {
    const selectedFlags = CRITICAL_FLAGS.filter(
      (flag) => draft.criticalFlags[flag.key] === "yes",
    );
    if (!selectedFlags.length) {
      return {
        message: "Select at least one critical-failure category.",
        targetId: "critical-failure-categories",
      };
    }
    for (const flag of selectedFlags) {
      if (!draft.criticalEvidenceTurns[flag.key].trim()) {
        return {
          message: `Provide evidence turn number(s) for ${flag.label}.`,
          targetId: `critical-evidence-turns-${flag.key}`,
        };
      }
      if (!draft.criticalEvidence[flag.key].trim()) {
        return {
          message: `Provide a brief explanation for ${flag.label}.`,
          targetId: `critical-evidence-${flag.key}`,
        };
      }
    }
  }

  if (!draft.genderContextHandling) {
    return { message: "Select how gender-related context was handled.", targetId: "gender-context" };
  }

  return null;
}

/** Copies the current rater's saved values into editable local state. */
function draftFromEpisode(episode: Episode | undefined): AnnotationDraft {
  if (!episode) return emptyDraft();
  return {
    scores: { ...emptyDraft().scores, ...episode.scores },
    evidenceTurns: { ...emptyDraft().evidenceTurns, ...episode.evidenceTurns },
    justifications: { ...emptyDraft().justifications, ...episode.justifications },
    criticalFlags: { ...emptyDraft().criticalFlags, ...episode.criticalFlags },
    criticalEvidence: { ...emptyDraft().criticalEvidence, ...episode.criticalEvidence },
    criticalEvidenceTurns: { ...emptyDraft().criticalEvidenceTurns, ...episode.criticalEvidenceTurns },
    criticalFailureObserved: episode.criticalFailureObserved ?? "",
    taskStatus: episode.taskStatus ?? "",
    participantBehaviours: { ...emptyDraft().participantBehaviours, ...episode.participantBehaviours },
    participantBehaviourEvidenceTurns: { ...emptyDraft().participantBehaviourEvidenceTurns, ...episode.participantBehaviourEvidenceTurns },
    participantBehaviourOther: episode.participantBehaviourOther ?? "",
    participantReactions: { ...emptyDraft().participantReactions, ...episode.participantReactions },
    participantReactionEvidenceTurns: { ...emptyDraft().participantReactionEvidenceTurns, ...episode.participantReactionEvidenceTurns },
    participantReactionOther: episode.participantReactionOther ?? "",
    episodeEnding: episode.episodeEnding ?? "",
    stoppingFactors: { ...emptyDraft().stoppingFactors, ...episode.stoppingFactors },
    stoppingFactorsEvidenceTurns: episode.stoppingFactorsEvidenceTurns ?? "",
    stoppingFactorsExplanation: episode.stoppingFactorsExplanation ?? "",
    genderContextHandling: episode.genderContextHandling ?? "",
    mostUsefulThing: episode.mostUsefulThing ?? "",
    suggestedImprovement: episode.suggestedImprovement ?? "",
    skipReason: episode.skipReason ?? "",
    comments: episode.comments ?? "",
  };
}

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function transcriptTurns(transcript: string): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];

  // Earlier de-identification exports flattened line breaks while retaining
  // stable [TURN ...] markers. Split on those markers instead of newlines so
  // every participant and Najah message is rendered as a separate bubble.
  const turnMarker = /\[TURN\s+(\d+)\]\s+(USER|NAJAH):\s*/gi;
  const matches = Array.from(transcript.matchAll(turnMarker));
  for (const [index, match] of matches.entries()) {
    const messageStart = (match.index ?? 0) + match[0].length;
    const messageEnd = matches[index + 1]?.index ?? transcript.length;
    turns.push({
      turn: match[1],
      speaker: match[2].toUpperCase() as "USER" | "NAJAH",
      text: transcript.slice(messageStart, messageEnd).trim(),
    });
  }

  if (!turns.length && transcript.trim()) {
    turns.push({ speaker: "NAJAH", turn: "—", text: transcript.trim() });
  }
  return turns;
}

/**
 * Return every non-English language pack needed across an episode.
 *
 * The dataset's episode-level label is useful but cannot describe every turn
 * in a code-switched conversation. We therefore combine the declared label
 * with direct script and vocabulary signals from the transcript and prior
 * context instead of stopping after the first declared language.
 */
function episodeTranslationLanguages(language: string, texts: string[]): string[] {
  const languages = new Set<string>();
  const declared = language
    .toLowerCase()
    .split("+")
    .map((value) => value.trim())
    .filter((value) => value === "ar" || value === "fr");
  for (const value of declared) languages.add(value);

  const combinedText = texts.join("\n");
  if (/[؀-ۿ]/.test(combinedText)) languages.add("ar");

  const frenchWords = combinedText.toLowerCase().match(/[a-zàâçéèêëîïôùûüÿœ']+/g) ?? [];
  const frenchMarkers = new Set([
    "avec", "bonjour", "dans", "des", "est", "et", "je", "le", "les",
    "mais", "merci", "nous", "oui", "pas", "pour", "que", "suis", "une",
    "vous", "votre", "comment", "emploi", "expérience", "formation",
  ]);
  const frenchScore = frenchWords.filter((word) => frenchMarkers.has(word)).length;
  if (/[àâçéèêëîïôùûüÿœ]/i.test(combinedText) || frenchScore >= 2) {
    languages.add("fr");
  }

  return Array.from(languages);
}

/** Choose the most plausible source language for an individual mixed-language turn. */
function turnTranslationLanguage(text: string, available: string[]): string | null {
  const arabicCharacters = (text.match(/[؀-ۿ]/g) ?? []).length;
  if (available.includes("ar") && arabicCharacters > 0) return "ar";

  const words = text.toLowerCase().match(/[a-zàâçéèêëîïôùûüÿœ']+/g) ?? [];
  const frenchMarkers = new Set([
    "avec", "bonjour", "dans", "des", "est", "et", "je", "le", "les",
    "mais", "merci", "nous", "oui", "pas", "pour", "que", "suis", "une", "vous",
  ]);
  const englishMarkers = new Set([
    "and", "can", "for", "have", "hello", "how", "is", "my", "please", "that",
    "the", "to", "want", "with", "would", "yes", "you", "your",
  ]);
  const frenchScore = words.filter((word) => frenchMarkers.has(word)).length;
  const englishScore = words.filter((word) => englishMarkers.has(word)).length;
  const hasFrenchAccents = /[àâçéèêëîïôùûüÿœ]/i.test(text);
  if (available.includes("fr") && (hasFrenchAccents || frenchScore > englishScore)) return "fr";
  if (englishScore > 0 && englishScore >= frenchScore) return null;

  // Short replies such as "oui" may contain only one language marker. A sole
  // French pack is a reasonable fallback, whereas Latin text must never be
  // sent through the Arabic translator merely because an episode was labelled ar.
  if (available.length === 1 && available[0] === "fr" && words.length > 0) return "fr";
  return null;
}

/** Rebuild a translated flattened transcript while preserving stable turn IDs. */
function translatedTranscriptText(original: string, turns: TranscriptTurn[]): string {
  if (!original.trim()) return "";
  const hasTurnMarkers = /\[TURN\s+\d+\]\s+(USER|NAJAH):/i.test(original);
  if (!hasTurnMarkers && turns.length === 1) return turns[0].text;
  return turns
    .map((turn) => `[TURN ${turn.turn}] ${turn.speaker}: ${turn.text}`)
    .join("\n");
}

/** Keep long turns within practical browser-translation input sizes. */
function translationChunks(text: string, maximumLength = 3200): string[] {
  if (text.length <= maximumLength) return [text];
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && current.length + word.length + 1 > maximumLength) {
      chunks.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Renders one anchored dimension and its optional evidence-turn reference.
 * Routine score justifications are intentionally omitted to keep rating fast.
 * The only optional score note is a routing-specific explanation when N/A is
 * selected, matching the locked fielding instrument.
 */
function ScoreCard({
  dimension,
  score,
  evidenceTurns,
  justification,
  onScoreChange,
  onEvidenceChange,
  onJustificationChange,
}: {
  dimension: RubricDimension;
  score: DimensionScore;
  evidenceTurns: string;
  justification: string;
  onScoreChange: (score: DimensionScore) => void;
  onEvidenceChange: (value: string) => void;
  onJustificationChange: (value: string) => void;
}) {
  const isNotApplicable = score === "na";
  const hasSelectedScore = score !== null;
  return (
    <section className="score-card" id={`rating-${dimension.key}`}>
      <div className="dimension-heading">
        <h4>{dimension.label}</h4>
        <span>{score === null ? "Not scored" : score === "na" ? "N/A selected" : `Score ${score}`}</span>
      </div>
      {dimension.question && <p className="dimension-question">{dimension.question}</p>}

      <details className="rubric-anchors">
        <summary>View scoring anchors</summary>
        <dl>
          {([3, 2, 1] as const).map((anchorScore) => (
            <div key={anchorScore}>
              <dt>{anchorScore}</dt>
              <dd>
                {dimension.anchorLabels?.[anchorScore] && (
                  <strong>{dimension.anchorLabels[anchorScore]}: </strong>
                )}
                {dimension.anchors[anchorScore]}
              </dd>
            </div>
          ))}
        </dl>
        {dimension.illustrativeExamples && (
          <div className="rubric-examples">
            <strong>Illustrative examples—not exhaustive</strong>
            <p>{dimension.illustrativeExamples}</p>
          </div>
        )}
        {dimension.guidanceNote && (
          <p className="rubric-guidance-note">
            <strong>Gender-sensitive guidance note:</strong> {dimension.guidanceNote}
          </p>
        )}
      </details>

      <fieldset className="score-choice">
        <legend>Score</legend>
        <div className="score-options" aria-label={`${dimension.label}, 1 to 3 or not applicable`}>
          {([1, 2, 3, "na"] as const).map((option) => (
            <label key={option} className={score === option ? "score selected" : "score"}>
              <input
                type="radio"
                name={dimension.key}
                value={option}
                checked={score === option}
                onChange={() => onScoreChange(option)}
              />
              {option === "na" ? "N/A" : option}
            </label>
          ))}
        </div>
      </fieldset>

      {!isNotApplicable && (
        <label className="evidence-field">
          <span>Evidence turn number(s) <small>optional</small></span>
          <input
            id={`evidence-${dimension.key}`}
            value={evidenceTurns}
            onChange={(event) => onEvidenceChange(event.target.value)}
            placeholder="e.g. 002, 004–006"
          />
        </label>
      )}

      {dimension.key === "routing" && isNotApplicable && hasSelectedScore && (
        <label className="evidence-field">
          <span>Why this cannot be assessed <small>optional</small></span>
          <textarea
            id={`justification-${dimension.key}`}
            value={justification}
            onChange={(event) => onJustificationChange(event.target.value)}
            placeholder="Optionally explain why routing cannot be assessed."
            rows={3}
          />
        </label>
      )}
    </section>
  );
}

/**
 * Records task progress separately from the observable event that interrupted
 * an incomplete task. The second question appears only when it is logically
 * applicable, keeping the exported fields mutually interpretable.
 */
function TaskStatusCard({
  status,
  onStatusChange,
}: {
  status: TaskStatus | "";
  onStatusChange: (value: TaskStatus) => void;
}) {
  return (
    <div className="task-status-stack">
      <fieldset className="episode-end-card" id="task-status">
        <legend>How far did the participant get with the module task?</legend>
        <div className="episode-end-options">
          {TASK_STATUSES.map((option) => (
            <label key={option.value} className={status === option.value ? "selected" : ""}>
              <input
                type="radio"
                name="task-status"
                value={option.value}
                checked={status === option.value}
                aria-label={option.label}
                onChange={() => onStatusChange(option.value)}
              />
              <span className="episode-option-copy">
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

    </div>
  );
}

const PARTICIPANT_BEHAVIOUR_GROUPS: readonly ParticipantBehaviourGroup[] = [
  "Task-progressing behaviour",
  "Challenging or non-progressing behaviour",
  "Other or uncertain behaviour",
];

/** Multi-select coding of what the participant observably did in the episode. */
function ParticipantBehaviourCard({
  behaviours,
  other,
  onChange,
  onOtherChange,
}: {
  behaviours: Record<ParticipantBehaviourKey, boolean>;
  other: string;
  onChange: (key: ParticipantBehaviourKey, selected: boolean) => void;
  onOtherChange: (value: string) => void;
}) {
  return (
    <fieldset className="critical-category-card participant-response-card" id="participant-behaviour">
      <legend>How did the participant respond to Najah during this module episode?</legend>
      <p>Select every behaviour observed at least once. Select options supported by the participant&apos;s messages.</p>
      {PARTICIPANT_BEHAVIOUR_GROUPS.map((group) => (
        <section className="participant-option-group" key={group}>
          <h4>{group}</h4>
          <div className="participant-option-list">
            {PARTICIPANT_BEHAVIOURS.filter((option) => option.group === group).map((option) => {
              const selected = behaviours[option.key];
              return (
                <div className={`participant-option-card${selected ? " selected" : ""}`} key={option.key}>
                  <label className="critical-checkbox-row">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => onChange(option.key, event.target.checked)}
                    />
                    <span className="episode-option-copy"><strong>{option.label}</strong></span>
                  </label>
                  <details className="participant-definition">
                    <summary>View definition and example</summary>
                    <p>{option.definition}</p>
                    {option.example && <p><strong>Illustrative example:</strong> “{option.example}”</p>}
                  </details>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {behaviours.otherObservableBehaviour && (
        <label className="evidence-field">
          <span>Specify the other observable participant behaviour <strong>required</strong></span>
          <textarea
            id="participant-behaviour-other"
            value={other}
            onChange={(event) => onOtherChange(event.target.value)}
            rows={2}
          />
        </label>
      )}
    </fieldset>
  );
}

/** Multi-select coding of reactions explicitly expressed by the participant. */
function ParticipantReactionCard({
  reactions,
  other,
  onChange,
  onOtherChange,
}: {
  reactions: Record<ParticipantReactionKey, boolean>;
  other: string;
  onChange: (key: ParticipantReactionKey, selected: boolean) => void;
  onOtherChange: (value: string) => void;
}) {
  return (
    <fieldset className="critical-category-card participant-response-card" id="participant-reaction">
      <legend>What reactions did the participant explicitly express during this module episode?</legend>
      <p>Select every reaction observed at least once. Select reactions that are explicit in the participant&apos;s messages.</p>
      <div className="participant-option-list">
        {PARTICIPANT_REACTIONS.map((option) => {
          const selected = reactions[option.key];
          return (
            <div className={`participant-option-card${selected ? " selected" : ""}`} key={option.key}>
              <label className="critical-checkbox-row">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(event) => onChange(option.key, event.target.checked)}
                />
                <span className="episode-option-copy"><strong>{option.label}</strong></span>
              </label>
              <details className="participant-definition">
                <summary>View definition and example</summary>
                <p>{option.definition}</p>
                {option.example && <p><strong>Illustrative example:</strong> “{option.example}”</p>}
              </details>
            </div>
          );
        })}
      </div>
      {reactions.otherExpressedReaction && (
        <label className="evidence-field">
          <span>Specify the other expressed participant reaction <strong>required</strong></span>
          <textarea
            id="participant-reaction-other"
            value={other}
            onChange={(event) => onOtherChange(event.target.value)}
            rows={2}
          />
        </label>
      )}
    </fieldset>
  );
}

/** Required primary ending for the bounded module episode shown to the rater. */
function EpisodeEndingCard({
  value,
  onChange,
}: {
  value: EpisodeEnding | "";
  onChange: (value: EpisodeEnding) => void;
}) {
  return (
    <fieldset className="episode-end-card" id="episode-ending">
      <legend>How did the available module episode end?</legend>
      <p>Select one primary ending based only on the available record.</p>
      <div className="episode-end-options">
        {EPISODE_ENDINGS.map((option) => (
          <label key={option.value} className={value === option.value ? "selected" : ""}>
            <input
              type="radio"
              name="episode-ending"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className="episode-option-copy">
              <strong>{option.label}</strong>
              {"description" in option && option.description && <small>{option.description}</small>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Required assessment of whether gender-related context was handled appropriately. */
function GenderContextCard({
  value,
  onChange,
}: {
  value: GenderContextHandling | "";
  onChange: (value: GenderContextHandling) => void;
}) {
  return (
    <fieldset className="episode-end-card" id="gender-context">
      <legend>How was gender-related context handled in this episode?</legend>
      <div className="episode-end-options">
        {GENDER_CONTEXT_OPTIONS.map((option) => (
          <label key={option.value} className={value === option.value ? "selected" : ""}>
            <input type="radio" name="gender-context" checked={value === option.value} onChange={() => onChange(option.value)} />
            <span className="episode-option-copy"><strong>{option.label}</strong></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Renders one selectable failure category and its required explanation. */
function CriticalFlagCard({
  flag,
  selected,
  evidence,
  evidenceTurns,
  onSelectedChange,
  onEvidenceChange,
  onEvidenceTurnsChange,
}: {
  flag: (typeof CRITICAL_FLAGS)[number];
  selected: boolean;
  evidence: string;
  evidenceTurns: string;
  onSelectedChange: (selected: boolean) => void;
  onEvidenceChange: (value: string) => void;
  onEvidenceTurnsChange: (value: string) => void;
}) {
  return (
    <article className={`critical-flag-card${selected ? " selected" : ""}`} id={`critical-${flag.key}`}>
      <label className="critical-checkbox-row">
        <input
          type="checkbox"
          aria-label={flag.label}
          checked={selected}
          onChange={(event) => onSelectedChange(event.target.checked)}
        />
        <span className="episode-option-copy">
          <strong>{flag.label}</strong>
          <small>{flag.trigger}</small>
        </span>
      </label>
      {selected && (
        <div className="critical-evidence-field">
        <label className="evidence-field">
          <span>Evidence turn number(s) <strong>required</strong></span>
          <input
            id={`critical-evidence-turns-${flag.key}`}
            value={evidenceTurns}
            onChange={(event) => onEvidenceTurnsChange(event.target.value)}
            placeholder="e.g. 002, 004–006"
          />
        </label>
        <label className="evidence-field">
          <span>
            {flag.key === "otherSeriousFailure"
              ? "Describe the other serious failure"
              : "Brief explanation"}{" "}
            <strong>required</strong>
          </span>
          <textarea
            id={`critical-evidence-${flag.key}`}
            value={evidence}
            onChange={(event) => onEvidenceChange(event.target.value)}
            placeholder="Briefly explain what happened."
            rows={3}
          />
        </label>
        </div>
      )}
    </article>
  );
}

/**
 * Uses a two-stage design: screen once for any critical failure, then reveal
 * multi-select categories only when the answer is Yes.
 */
function CriticalFailureCard({
  observed,
  flags,
  evidence,
  evidenceTurns,
  onObservedChange,
  onFlagChange,
  onEvidenceChange,
  onEvidenceTurnsChange,
}: {
  observed: CriticalFailureObserved | "";
  flags: Record<CriticalFlagKey, CriticalFlagValue>;
  evidence: Record<CriticalFlagKey, string>;
  evidenceTurns: Record<CriticalFlagKey, string>;
  onObservedChange: (value: CriticalFailureObserved) => void;
  onFlagChange: (key: CriticalFlagKey, selected: boolean) => void;
  onEvidenceChange: (key: CriticalFlagKey, value: string) => void;
  onEvidenceTurnsChange: (key: CriticalFlagKey, value: string) => void;
}) {
  return (
    <div className="critical-failure-stack">
      <fieldset className="episode-end-card critical-screen-card" id="critical-failure-observed">
        <legend>Was any critical failure observed in this module episode?</legend>
        <p>Select Cannot determine only when the available record is insufficient.</p>
        <div className="episode-end-options">
          {CRITICAL_FAILURE_OBSERVATIONS.map((option) => (
            <label key={option.value} className={observed === option.value ? "selected" : ""}>
              <input
                type="radio"
                aria-label={option.label}
                name="critical-failure-observed"
                value={option.value}
                checked={observed === option.value}
                onChange={() => onObservedChange(option.value)}
              />
              <span className="episode-option-copy">
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {observed === "yes" && (
        <fieldset className="critical-category-card conditional-card" id="critical-failure-categories">
          <legend>Which critical failure or failures occurred?</legend>
          <p>Select all that apply. Evidence turn number(s) and a short explanation are required for every selected failure.</p>
          <div className="critical-flag-list">
            {CRITICAL_FLAGS.map((flag) => (
              <CriticalFlagCard
                key={flag.key}
                flag={flag}
                selected={flags[flag.key] === "yes"}
                evidence={evidence[flag.key]}
                evidenceTurns={evidenceTurns[flag.key]}
                onSelectedChange={(selected) => onFlagChange(flag.key, selected)}
                onEvidenceChange={(value) => onEvidenceChange(flag.key, value)}
                onEvidenceTurnsChange={(value) => onEvidenceTurnsChange(flag.key, value)}
              />
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}

export function AnnotatorApp({ initialRater }: { initialRater: Rater }) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [rater, setRater] = useState(initialRater);
  const [reviewLayer, setReviewLayer] = useState<ReviewLayer>("legacy");
  const [requiredRatingsPerEpisode, setRequiredRatingsPerEpisode] = useState(
    REQUIRED_PRIMARY_RATINGS_PER_EPISODE,
  );
  const readOnly = !rater.canRate;
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<AnnotationDraft>(emptyDraft);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [activeSaveAction, setActiveSaveAction] = useState<"draft" | "complete" | null>(null);
  const [navigationDirection, setNavigationDirection] = useState<-1 | 1 | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [skipReasonError, setSkipReasonError] = useState("");
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(() => new Set());
  const [draftDeleteRequest, setDraftDeleteRequest] = useState<DraftDeleteRequest | null>(null);
  const [deletingDrafts, setDeletingDrafts] = useState(false);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [treatmentFilter, setTreatmentFilter] = useState("all");
  const [viewFilter, setViewFilter] = useState<ViewFilter>(
    initialRater.canRate ? "queue" : "all",
  );
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressView, setProgressView] = useState<ProgressView>("not_started");
  const [transcriptView, setTranscriptView] = useState<"original" | "english">("original");
  const [translationStatus, setTranslationStatus] = useState<TranslationStatus>("idle");
  const [translatedTurns, setTranslatedTurns] = useState<TranscriptTurn[]>([]);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [translationMessage, setTranslationMessage] = useState("");
  const [translatedPriorContext, setTranslatedPriorContext] = useState("");
  const [translationUnavailableCount, setTranslationUnavailableCount] = useState(0);
  const translationCache = useRef(new Map<string, EpisodeTranslation>());
  const translationRequest = useRef(0);
  const hydratedEpisodeId = useRef("");
  const draftRevision = useRef(0);
  const latestSaveRequest = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const autosaveTimeout = useRef<number | null>(null);
  const selectedIdRef = useRef(selectedId);

  const loadEpisodes = useCallback(async (preferredId?: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/episodes", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load episodes.");
      const loaded = payload.episodes as Episode[];
      setEpisodes(loaded);
      const loadedRater = (payload.rater ?? initialRater) as Rater;
      setRater(loadedRater);
      setReviewLayer((payload.reviewLayer ?? "legacy") as ReviewLayer);
      setRequiredRatingsPerEpisode(
        Number(payload.requiredRatingsPerEpisode) || REQUIRED_PRIMARY_RATINGS_PER_EPISODE,
      );
      if (!loadedRater.canRate) setViewFilter("all");
      setSelectedId((current) => {
        const candidate = preferredId || current;
        return loaded.some((episode) => episode.episodeId === candidate)
          ? candidate
          : loaded[0]?.episodeId || "";
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load episodes.");
    } finally {
      setLoading(false);
    }
  }, [initialRater]);

  useEffect(() => {
    // Loading starts an asynchronous external request; its eventual callbacks
    // synchronize the component with the server response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEpisodes();
  }, [loadEpisodes]);

  const current = episodes.find((episode) => episode.episodeId === selectedId);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const episodeId = current?.episodeId ?? "";

    // Saving updates the episode object in the local list. Only hydrate when
    // the episode ID changes so that an autosave response cannot reset newer
    // selections made while the request was in flight.
    if (hydratedEpisodeId.current === episodeId) return;
    hydratedEpisodeId.current = episodeId;
    draftRevision.current = 0;

    setDraft(draftFromEpisode(current));
    setDirty(false);
    setSaveState("saved");
    setTranscriptView("original");
    setTranslationMessage("");
    setTranslationProgress(0);
    setSkipReasonError("");
    translationRequest.current += 1;
    const cached = current ? translationCache.current.get(current.episodeId) : undefined;
    setTranslatedTurns(cached?.transcriptTurns ?? []);
    setTranslatedPriorContext(cached?.priorContext ?? "");
    setTranslationUnavailableCount(cached?.unavailableCount ?? 0);
    setTranslationStatus(cached ? "ready" : "idle");
  }, [current]);

  const modules = useMemo(
    () => Array.from(new Set(episodes.map((episode) => episode.module))).sort(),
    [episodes],
  );
  const hasUnknownTreatment = episodes.some((episode) => episode.treatment === "unknown");

  const filteredEpisodes = useMemo(() => {
    return episodes.filter((episode) => {
      const matchesModule = moduleFilter === "all" || episode.module === moduleFilter;
      const matchesTreatment =
        treatmentFilter === "all" || episode.treatment === treatmentFilter;
      const matchesView = readOnly ||
        viewFilter === "all" ||
        (viewFilter === "queue" &&
          episode.annotationStatus !== "complete" &&
          episode.completedRaterCount < requiredRatingsPerEpisode &&
          (reviewLayer !== "judge" || episode.judgeBaseAssignment === rater.assignmentCohort)) ||
        (viewFilter === "drafts" && episode.annotationStatus === "draft") ||
        (viewFilter === "completed" && episode.annotationStatus === "complete") ||
        (viewFilter === "mismatches" && episode.primaryMismatch);
      return matchesModule && matchesTreatment && matchesView;
    });
  }, [episodes, moduleFilter, rater.assignmentCohort, readOnly, requiredRatingsPerEpisode, reviewLayer, treatmentFilter, viewFilter]);

  useEffect(() => {
    if (reviewLayer !== "judge" && viewFilter === "mismatches") {
      // Assignment changes may turn a judge account back into a primary rater.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setViewFilter("queue");
    }
  }, [reviewLayer, viewFilter]);

  useEffect(() => {
    if (filteredEpisodes.length && !filteredEpisodes.some((episode) => episode.episodeId === selectedId)) {
      // Filter changes can remove the active episode, so select the first
      // visible item to keep the queue and form consistent.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedId(filteredEpisodes[0].episodeId);
    }
  }, [filteredEpisodes, selectedId]);

  /** Clears a previous submission warning as soon as the rater corrects a field. */
  function clearSubmissionFeedback() {
    setError("");
    setSubmitError("");
  }

  /** Marks the local draft as newer than any save already in progress. */
  function markDraftChanged() {
    draftRevision.current += 1;
    setDirty(true);
    setSaveState("unsaved");
  }

  /** Updates one optional evidence-turn reference without replacing the others. */
  function updateEvidenceTurns(key: DimensionKey, value: string) {
    clearSubmissionFeedback();
    setDraft((previous) => ({
      ...previous,
      evidenceTurns: { ...previous.evidenceTurns, [key]: value },
    }));
    markDraftChanged();
  }

  /** Records an optional written explanation for one dimension score. */
  function updateJustification(key: DimensionKey, value: string) {
    clearSubmissionFeedback();
    setDraft((previous) => ({
      ...previous,
      justifications: { ...previous.justifications, [key]: value },
    }));
    markDraftChanged();
  }

  /** Changes a dimension score while preserving any existing rater notes. */
  function updateScore(key: DimensionKey, score: DimensionScore) {
    clearSubmissionFeedback();
    setDraft((previous) => ({
      ...previous,
      scores: { ...previous.scores, [key]: score },
      evidenceTurns: score === "na"
        ? { ...previous.evidenceTurns, [key]: "" }
        : previous.evidenceTurns,
    }));
    markDraftChanged();
  }

  /** Saves the required task-outcome category. */
  function updateTaskStatus(value: TaskStatus) {
    clearSubmissionFeedback();
    setDraft((previous) => ({ ...previous, taskStatus: value }));
    markDraftChanged();
  }

  /** Records observable participant behaviour, with mutually exclusive neutral options. */
  function updateParticipantBehaviour(key: ParticipantBehaviourKey, selected: boolean) {
    clearSubmissionFeedback();
    setDraft((previous) => {
      const exclusive = key === "noClearBehaviouralResponse" || key === "cannotDetermine";
      const behaviours = exclusive && selected
        ? keyedRecord(PARTICIPANT_BEHAVIOUR_KEYS, () => false)
        : { ...previous.participantBehaviours };
      if (!exclusive && selected) {
        behaviours.noClearBehaviouralResponse = false;
        behaviours.cannotDetermine = false;
      }
      behaviours[key] = selected;
      const updatedEvidenceTurns = exclusive && selected
        ? keyedRecord(PARTICIPANT_BEHAVIOUR_KEYS, () => "")
        : { ...previous.participantBehaviourEvidenceTurns };
      if (!selected) updatedEvidenceTurns[key] = "";
      return {
        ...previous,
        participantBehaviours: behaviours,
        participantBehaviourEvidenceTurns: updatedEvidenceTurns,
        participantBehaviourOther: behaviours.otherObservableBehaviour
          ? previous.participantBehaviourOther
          : "",
      };
    });
    markDraftChanged();
  }

  /** Records explicit participant reactions, with mutually exclusive neutral options. */
  function updateParticipantReaction(key: ParticipantReactionKey, selected: boolean) {
    clearSubmissionFeedback();
    setDraft((previous) => {
      const exclusive = key === "noExplicitReaction" || key === "cannotDetermine";
      const reactions = exclusive && selected
        ? keyedRecord(PARTICIPANT_REACTION_KEYS, () => false)
        : { ...previous.participantReactions };
      if (!exclusive && selected) {
        reactions.noExplicitReaction = false;
        reactions.cannotDetermine = false;
      }
      reactions[key] = selected;
      const updatedEvidenceTurns = exclusive && selected
        ? keyedRecord(PARTICIPANT_REACTION_KEYS, () => "")
        : { ...previous.participantReactionEvidenceTurns };
      if (!selected) updatedEvidenceTurns[key] = "";
      return {
        ...previous,
        participantReactions: reactions,
        participantReactionEvidenceTurns: updatedEvidenceTurns,
        participantReactionOther: reactions.otherExpressedReaction
          ? previous.participantReactionOther
          : "",
      };
    });
    markDraftChanged();
  }

  /** Records the primary observable boundary of the module episode. */
  function updateEpisodeEnding(value: EpisodeEnding) {
    clearSubmissionFeedback();
    setDraft((previous) => ({ ...previous, episodeEnding: value }));
    markDraftChanged();
  }

  /** Updates one free-text or single-select field while preserving autosave semantics. */
  function updateDraftField<K extends keyof AnnotationDraft>(key: K, value: AnnotationDraft[K]) {
    clearSubmissionFeedback();
    setDraft((previous) => ({ ...previous, [key]: value }));
    markDraftChanged();
  }

  /** Updates the explanation attached to one selected failure category. */
  function updateCriticalEvidence(key: CriticalFlagKey, value: string) {
    clearSubmissionFeedback();
    setDraft((previous) => ({
      ...previous,
      criticalEvidence: { ...previous.criticalEvidence, [key]: value },
    }));
    markDraftChanged();
  }

  /** Updates the required evidence-turn citation for one selected failure. */
  function updateCriticalEvidenceTurns(key: CriticalFlagKey, value: string) {
    clearSubmissionFeedback();
    setDraft((previous) => ({
      ...previous,
      criticalEvidenceTurns: { ...previous.criticalEvidenceTurns, [key]: value },
    }));
    markDraftChanged();
  }

  /** Selects or clears one category in the conditional multi-select list. */
  function updateCriticalFlag(key: CriticalFlagKey, selected: boolean) {
    clearSubmissionFeedback();
    setDraft((previous) => ({
      ...previous,
      criticalFlags: { ...previous.criticalFlags, [key]: selected ? "yes" : "no" },
      criticalEvidence: !selected
        ? { ...previous.criticalEvidence, [key]: "" }
        : previous.criticalEvidence,
      criticalEvidenceTurns: !selected
        ? { ...previous.criticalEvidenceTurns, [key]: "" }
        : previous.criticalEvidenceTurns,
    }));
    markDraftChanged();
  }

  /**
   * Records the screening answer and clears category data that no longer
   * applies. Choosing Yes initializes every category as unselected (No).
   */
  function updateCriticalFailureObserved(value: CriticalFailureObserved) {
    clearSubmissionFeedback();
    setDraft((previous) => ({
      ...previous,
      criticalFailureObserved: value,
      criticalFlags: value === "yes"
        ? Object.fromEntries(CRITICAL_FLAG_KEYS.map((key) => [
          key,
          previous.criticalFailureObserved === "yes" && previous.criticalFlags[key] === "yes"
            ? "yes"
            : "no",
        ])) as Record<CriticalFlagKey, CriticalFlagValue>
        : keyedRecord(CRITICAL_FLAG_KEYS, () => value === "no" ? "no" : null),
      criticalEvidence: value === "yes" && previous.criticalFailureObserved === "yes"
        ? previous.criticalEvidence
        : keyedRecord(CRITICAL_FLAG_KEYS, () => ""),
      criticalEvidenceTurns: value === "yes" && previous.criticalFailureObserved === "yes"
        ? previous.criticalEvidenceTurns
        : keyedRecord(CRITICAL_FLAG_KEYS, () => ""),
    }));
    markDraftChanged();
  }

  /** Updates the optional episode-level adjudication note. */
  function updateComments(value: string) {
    clearSubmissionFeedback();
    setDraft((previous) => ({ ...previous, comments: value }));
    markDraftChanged();
  }

  /** Records the auditable explanation required before an episode is skipped. */
  function updateSkipReason(value: string) {
    clearSubmissionFeedback();
    setSkipReasonError("");
    setDraft((previous) => ({ ...previous, skipReason: value }));
    markDraftChanged();
  }

  async function persist(
    status: "draft" | "complete",
    quiet = false,
    action: "save" | "skip" = "save",
  ) {
    if (!current || readOnly) return false;
    if (autosaveTimeout.current !== null) {
      window.clearTimeout(autosaveTimeout.current);
      autosaveTimeout.current = null;
    }

    const episodeId = current.episodeId;
    const snapshot = draft;
    const revision = draftRevision.current;
    const requestId = ++latestSaveRequest.current;
    if (!quiet) setActiveSaveAction(status);
    setSaveState("saving");

    // Serialize requests so a slow, older autosave can never overwrite a newer
    // selection on the server by completing out of order.
    const operation = saveQueue.current
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch("/api/annotations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ episodeId, ...snapshot, status, action }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to save this annotation.");
      });
    saveQueue.current = operation.then(() => undefined, () => undefined);

    try {
      await operation;

      setEpisodes((previous) =>
        previous.map((episode) => {
          if (episode.episodeId !== episodeId) return episode;
          const newlyCompleted = status === "complete" && episode.annotationStatus !== "complete";
          return {
            ...episode,
            ...snapshot,
            annotationStatus: status,
            completedRaterCount: episode.completedRaterCount + (newlyCompleted ? 1 : 0),
            annotationUpdatedAt: new Date().toISOString(),
          };
        }),
      );

      const isLatestVisibleDraft =
        selectedIdRef.current === episodeId &&
        draftRevision.current === revision &&
        latestSaveRequest.current === requestId;
      if (isLatestVisibleDraft) {
        setDirty(false);
        setSaveState("saved");
        if (status === "complete") {
          setError("");
          setSubmitError("");
        }
        if (!quiet) setNotice(status === "complete" ? "Rating submitted." : "Draft saved.");
      }
      return true;
    } catch (requestError) {
      const isLatestVisibleRequest =
        selectedIdRef.current === episodeId &&
        draftRevision.current === revision &&
        latestSaveRequest.current === requestId;
      if (isLatestVisibleRequest) setSaveState("error");
      if (!quiet && isLatestVisibleRequest) {
        const message = requestError instanceof Error ? requestError.message : "Unable to save.";
        setError(message);
        if (status === "complete") setSubmitError(message);
      }
      return false;
    } finally {
      if (!quiet && latestSaveRequest.current === requestId) setActiveSaveAction(null);
    }
  }

  useEffect(() => {
    if (readOnly || !dirty || !current) return;
    if (autosaveTimeout.current !== null) window.clearTimeout(autosaveTimeout.current);
    autosaveTimeout.current = window.setTimeout(() => {
      autosaveTimeout.current = null;
      void persist("draft", true);
    }, 1000);
    return () => {
      if (autosaveTimeout.current !== null) {
        window.clearTimeout(autosaveTimeout.current);
        autosaveTimeout.current = null;
      }
    };
    // `draft` is the intentional autosave trigger. Including `persist` would
    // recreate the timeout on every render because it closes over form state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty, readOnly, selectedId]);

  useEffect(() => {
    if (!progressOpen) return;

    /** Closing on Escape keeps the progress list usable without a mouse. */
    function closeProgressOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setProgressOpen(false);
    }
    window.addEventListener("keydown", closeProgressOnEscape);
    return () => window.removeEventListener("keydown", closeProgressOnEscape);
  }, [progressOpen]);

  async function navigate(direction: -1 | 1) {
    if (!filteredEpisodes.length || navigationDirection !== null) return;
    setNavigationDirection(direction);
    try {
      if (dirty) {
        const saved = await persist("draft", true);
        if (!saved) return;
      }
      const currentIndex = Math.max(
        0,
        filteredEpisodes.findIndex((episode) => episode.episodeId === selectedId),
      );
      const nextIndex = Math.min(
        filteredEpisodes.length - 1,
        Math.max(0, currentIndex + direction),
      );
      setSelectedId(filteredEpisodes[nextIndex].episodeId);
    } finally {
      setNavigationDirection(null);
    }
  }

  async function submitAndAdvance() {
    const problem = firstSubmissionProblem(draft);
    if (problem) {
      setNotice("");
      setError(problem.message);
      setSubmitError(problem.message);
      window.requestAnimationFrame(() => {
        const target = document.getElementById(problem.targetId);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        const focusTarget = target?.matches("input, textarea, button")
          ? target
          : target?.querySelector<HTMLElement>("input, textarea, button");
        if (focusTarget instanceof HTMLElement) focusTarget.focus({ preventScroll: true });
      });
      return;
    }

    setError("");
    setNotice("");
    setSubmitError("");
    const saved = await persist("complete");
    if (!saved) return;
    const currentIndex = filteredEpisodes.findIndex((episode) => episode.episodeId === selectedId);
    const next = filteredEpisodes[currentIndex + 1] || filteredEpisodes[0];
    if (next && next.episodeId !== selectedId) setSelectedId(next.episodeId);
  }

  /**
   * Leaves the current episode available for later review and opens the next
   * visible episode. The mandatory skip reason and any partial answers are
   * saved as a draft before navigation.
   */
  async function skipAndAdvance() {
    if (!current || skipping) return;
    if (!draft.skipReason.trim()) {
      setNotice("");
      setSkipReasonError("Enter a reason before skipping this episode.");
      window.requestAnimationFrame(() => {
        const target = document.getElementById("skip-reason");
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        target?.focus({ preventScroll: true });
      });
      return;
    }
    if (filteredEpisodes.length < 2) {
      setNotice("There is no other episode in the current list to open.");
      return;
    }

    setSkipping(true);
    setError("");
    setSubmitError("");
    setSkipReasonError("");
    try {
      const saved = await persist("draft", true, "skip");
      if (!saved) return;
      const currentIndex = filteredEpisodes.findIndex(
        (episode) => episode.episodeId === current.episodeId,
      );
      const nextIndex = currentIndex >= 0
        ? (currentIndex + 1) % filteredEpisodes.length
        : 0;
      setSelectedId(filteredEpisodes[nextIndex].episodeId);
      setNotice(
        reviewLayer === "judge"
          ? "Episode skipped. You can return to it from its assigned review list."
          : "Episode skipped. You can return to it from My queue.",
      );
    } finally {
      setSkipping(false);
    }
  }

  /**
   * Opens an episode selected from the progress list and changes the queue view
   * so the chosen status is not immediately hidden by the sidebar filters.
   */
  async function openEpisodeFromProgress(episode: Episode) {
    if (dirty && current?.episodeId !== episode.episodeId) {
      const saved = await persist("draft", true);
      if (!saved) return;
    }
    setModuleFilter("all");
    setTreatmentFilter("all");
    setViewFilter(
      progressView === "queue"
        ? "queue"
        : progressView === "random"
          ? episode.annotationStatus === "complete"
            ? "completed"
            : episode.annotationStatus === "draft"
              ? "drafts"
              : "queue"
        : progressView === "mismatches"
          ? "mismatches"
        : progressView === "all"
          ? "all"
          : episode.annotationStatus === "complete"
        ? "completed"
        : episode.annotationStatus === "draft"
          ? "drafts"
          : "all",
    );
    setSelectedId(episode.episodeId);
    setProgressOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Opens the sidebar category as a navigable episode list. */
  function openViewList(view: ViewFilter) {
    setViewFilter(view);
    setProgressView(
      view === "queue"
        ? reviewLayer === "judge" ? "random" : "queue"
        : view === "drafts"
          ? "draft"
          : view === "completed"
            ? "complete"
            : view === "mismatches"
              ? "mismatches"
            : "all",
    );
    setProgressOpen(true);
  }

  /** Adds or removes one draft from the bulk-deletion selection. */
  function toggleDraftSelection(episodeId: string, selected: boolean) {
    setSelectedDraftIds((previous) => {
      const next = new Set(previous);
      if (selected) next.add(episodeId);
      else next.delete(episodeId);
      return next;
    });
  }

  /** Selects or clears every draft currently shown in the progress dialog. */
  function toggleAllVisibleDrafts(selected: boolean) {
    setSelectedDraftIds((previous) => {
      const next = new Set(previous);
      for (const episode of progressEpisodes) {
        if (episode.annotationStatus !== "draft") continue;
        if (selected) next.add(episode.episodeId);
        else next.delete(episode.episodeId);
      }
      return next;
    });
  }

  /**
   * Opens the irreversible-deletion warning after ensuring that local edits to
   * the current episode are represented by a server-side draft.
   */
  async function requestDraftDeletion(episodeIds: string[], label: string) {
    const uniqueIds = Array.from(new Set(episodeIds.filter(Boolean)));
    if (!uniqueIds.length) return;
    if (dirty && current && uniqueIds.includes(current.episodeId)) {
      const saved = await persist("draft", true);
      if (!saved) return;
    }
    setError("");
    setNotice("");
    setDraftDeleteRequest({ episodeIds: uniqueIds, label });
  }

  /** Permanently removes only this signed-in rater's selected draft rows. */
  async function deleteRequestedDrafts() {
    if (!draftDeleteRequest || deletingDrafts) return;
    setDeletingDrafts(true);
    setError("");
    try {
      const response = await fetch("/api/annotations", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ episodeIds: draftDeleteRequest.episodeIds }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to delete the selected drafts.");

      const deletedIds = new Set<string>(
        Array.isArray(payload.deletedEpisodeIds)
          ? payload.deletedEpisodeIds
          : draftDeleteRequest.episodeIds,
      );
      const deletedCurrent = current ? deletedIds.has(current.episodeId) : false;
      setEpisodes((previous) => previous.map((episode) => (
        deletedIds.has(episode.episodeId)
          ? {
              ...episode,
              ...emptyDraft(),
              annotationStatus: null,
              annotationUpdatedAt: null,
            }
          : episode
      )));
      setSelectedDraftIds((previous) => {
        const next = new Set(previous);
        for (const episodeId of deletedIds) next.delete(episodeId);
        return next;
      });
      if (deletedCurrent) {
        draftRevision.current += 1;
        latestSaveRequest.current += 1;
        setDraft(emptyDraft());
        setDirty(false);
        setSaveState("saved");
        setSkipReasonError("");
        setSubmitError("");
      }
      setDraftDeleteRequest(null);
      const deletedCount = Number(payload.deletedCount ?? deletedIds.size);
      setNotice(`${deletedCount} draft${deletedCount === 1 ? "" : "s"} permanently deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete drafts.");
    } finally {
      setDeletingDrafts(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  /**
   * Translate one episode on demand with Chrome's local Translator API.
   * Original text is never replaced, uploaded, or written to the annotation.
   */
  async function showEnglishTranslation() {
    if (!current) return;
    if (
      translationStatus === "ready" &&
      (translatedTurns.length || translatedPriorContext) &&
      translationUnavailableCount === 0
    ) {
      setTranscriptView("english");
      return;
    }

    const sourceLanguages = episodeTranslationLanguages(current.language, [
      current.transcript,
      current.priorContext,
    ]);
    if (!sourceLanguages.length) {
      // English-only episodes still support the same toggle so raters do not
      // encounter an error merely because no translation model is required.
      const englishOnly: EpisodeTranslation = {
        transcriptTurns: transcriptTurns(current.transcript).map((turn) => ({
          ...turn,
          translationState: "already_english",
        })),
        priorContext: current.priorContext,
        unavailableCount: 0,
      };
      translationCache.current.set(current.episodeId, englishOnly);
      setTranslatedTurns(englishOnly.transcriptTurns);
      setTranslatedPriorContext(englishOnly.priorContext);
      setTranslationUnavailableCount(0);
      setTranslationStatus("ready");
      setTranslationMessage("");
      setTranscriptView("english");
      return;
    }

    const browserAI = globalThis as typeof globalThis & {
      Translator?: BrowserTranslatorFactory;
    };
    if (!browserAI.Translator) {
      setTranslationStatus("error");
      setTranslationMessage(
        "English translation requires a recent desktop Chrome browser. The original conversation remains available.",
      );
      return;
    }

    const requestId = ++translationRequest.current;
    setTranslationStatus("preparing");
    setTranslationProgress(0);
    setTranslationMessage("Preparing English translation…");
    setTranslationUnavailableCount(0);

    const translators = new Map<string, BrowserTranslator>();
    try {
      // Each language pack is prepared independently. Promise.allSettled keeps
      // a failed Arabic or French pack from cancelling translations that can
      // still be produced with the other pack.
      const translatorResults = await Promise.allSettled(
        sourceLanguages.map(async (sourceLanguage) => {
          const availability = await browserAI.Translator!.availability?.({
            sourceLanguage,
            targetLanguage: "en",
          });
          if (availability === "unavailable") {
            throw new Error(`${sourceLanguage}-to-English is unavailable in this browser.`);
          }

          const translator = await browserAI.Translator!.create({
            sourceLanguage,
            targetLanguage: "en",
            monitor(monitor) {
              monitor.addEventListener("downloadprogress", (event) => {
                if (translationRequest.current !== requestId) return;
                setTranslationProgress(Math.round(event.loaded * 100));
                setTranslationMessage(`Preparing language pack… ${Math.round(event.loaded * 100)}%`);
              });
            },
          });
          return [sourceLanguage, translator] as const;
        }),
      );
      for (const result of translatorResults) {
        if (result.status === "fulfilled") {
          const [language, translator] = result.value;
          translators.set(language, translator);
        }
      }

      if (!translators.size) {
        throw new Error("No required language pair is available.");
      }

      const originalTurns = transcriptTurns(current.transcript);
      const originalPriorTurns = transcriptTurns(current.priorContext);
      const totalUnits = originalTurns.length + originalPriorTurns.length;
      let completedUnits = 0;
      let unavailableCount = 0;
      setTranslationStatus("translating");

      /** Translate one set of turns without allowing one failed turn to abort the episode. */
      async function translateTurnSet(original: TranscriptTurn[]): Promise<TranscriptTurn[]> {
        const translated: TranscriptTurn[] = [];
        for (const turn of original) {
          if (translationRequest.current !== requestId) return translated;
          const sourceLanguage = turnTranslationLanguage(turn.text, sourceLanguages);
          const translator = sourceLanguage ? translators.get(sourceLanguage) : undefined;
          let translatedTurn: TranscriptTurn;

          if (!sourceLanguage) {
            translatedTurn = { ...turn, translationState: "already_english" };
          } else if (!translator) {
            unavailableCount += 1;
            translatedTurn = { ...turn, translationState: "unavailable" };
          } else {
            try {
              const pieces: string[] = [];
              for (const chunk of translationChunks(turn.text)) {
                pieces.push(await translator.translate(chunk));
              }
              translatedTurn = {
                ...turn,
                text: pieces.join(" "),
                translationState: "translated",
              };
            } catch {
              // Preserve the original message and continue with the remaining
              // turns. The rater sees an explicit marker and can retry later.
              unavailableCount += 1;
              translatedTurn = { ...turn, translationState: "unavailable" };
            }
          }

          translated.push(translatedTurn);
          completedUnits += 1;
          const percent = Math.round((completedUnits / Math.max(totalUnits, 1)) * 100);
          setTranslationProgress(percent);
          setTranslationMessage(`Translating conversation and context… ${percent}%`);
        }
        return translated;
      }

      const translatedPriorTurns = await translateTurnSet(originalPriorTurns);
      const translated = await translateTurnSet(originalTurns);

      if (translationRequest.current !== requestId) return;
      const result: EpisodeTranslation = {
        transcriptTurns: translated,
        priorContext: translatedTranscriptText(current.priorContext, translatedPriorTurns),
        unavailableCount,
      };
      translationCache.current.set(current.episodeId, result);
      setTranslatedTurns(translated);
      setTranslatedPriorContext(result.priorContext);
      setTranslationUnavailableCount(unavailableCount);
      setTranslationStatus("ready");
      setTranslationProgress(100);
      setTranslationMessage(
        unavailableCount
          ? `${unavailableCount} message${unavailableCount === 1 ? "" : "s"} could not be translated and remain in the original language. Select English translation again to retry.`
          : "",
      );
      setTranscriptView("english");
    } catch {
      if (translationRequest.current !== requestId) return;
      setTranslationStatus("error");
      setTranslationMessage(
        "English translation could not be prepared. Use a recent desktop Chrome browser, check that Chrome can download its language packs, and select English translation to retry. The original text remains available.",
      );
    } finally {
      for (const translator of translators.values()) translator.destroy?.();
    }
  }

  function exportMyWork() {
    const columns = [
      "rater_email",
      "rater_access",
      "review_layer",
      "assignment_cohort",
      "episode_id",
      "study_order",
      "student_status",
      "module",
      "treatment",
      "language",
      "annotation_status",
      "task_outcome",
      ...PARTICIPANT_BEHAVIOURS.map((behaviour) => `participant_behaviour_${behaviour.key}`),
      "participant_behaviour_other",
      ...PARTICIPANT_REACTIONS.map((reaction) => `participant_reaction_${reaction.key}`),
      "participant_reaction_other",
      "episode_ending",
      "gender_context_handling",
      "most_useful_thing",
      "suggested_improvement",
      "skip_reason",
      "critical_failure_observed",
      ...RUBRIC_DIMENSIONS.flatMap((dimension) => [
        `${dimension.key}_score`,
        `${dimension.key}_evidence_turns`,
        ...(dimension.key === "routing" ? ["routing_na_reason"] : []),
      ]),
      ...CRITICAL_FLAGS.flatMap((flag) => [
        `${flag.key}_flag`,
        `${flag.key}_evidence_turns`,
        `${flag.key}_evidence_explanation`,
      ]),
      "comments",
    ];
    const rows = episodes
      .filter((episode) => episode.annotationStatus)
      .map((episode) => [
        rater.email,
        userAccessLabel(rater.role, rater.canRate),
        reviewLayer,
        rater.assignmentCohort,
        episode.episodeId,
        episode.studyOrder,
        studentStatusLabel(episode.studentStatus),
        episode.module,
        treatmentLabel(episode.treatment),
        episode.language,
        episode.annotationStatus,
        episode.taskStatus ||
          (episode.legacyEpisodeEndReason === "output_delivered_unconfirmed"
            ? "output_delivered_confirmation_not_observed"
            : episode.legacyEpisodeEndReason === "task_completed"
              ? "task_completed_under_previous_rubric"
              : episode.legacyEpisodeEndReason === "cannot_determine"
                ? "cannot_determine"
                : ""),
        ...PARTICIPANT_BEHAVIOURS.map((behaviour) => episode.participantBehaviours[behaviour.key]),
        episode.participantBehaviourOther,
        ...PARTICIPANT_REACTIONS.map((reaction) => episode.participantReactions[reaction.key]),
        episode.participantReactionOther,
        episode.episodeEnding ||
          (episode.legacyEpisodeEndReason === "output_delivered_unconfirmed" ||
          episode.legacyEpisodeEndReason === "task_completed"
            ? "intended_output_delivered"
            : episode.legacyEpisodeEndReason === "participant_moved_module"
              ? "participant_moved_module"
              : episode.legacyEpisodeEndReason === "no_further_participant_reply"
                ? "no_further_participant_reply"
                : episode.legacyEpisodeEndReason === "no_further_najah_reply"
                  ? "no_further_najah_reply"
                  : episode.legacyEpisodeEndReason === "system_or_technical_failure"
                    ? "technical_failure"
                    : episode.legacyEpisodeEndReason === "cannot_determine"
                      ? "cannot_determine"
                      : ""),
        episode.genderContextHandling,
        episode.mostUsefulThing,
        episode.suggestedImprovement,
        episode.skipReason,
        episode.criticalFailureObserved,
        ...RUBRIC_DIMENSIONS.flatMap((dimension) => [
          episode.scores[dimension.key],
          episode.evidenceTurns[dimension.key],
          ...(dimension.key === "routing" ? [episode.justifications.routing] : []),
        ]),
        ...CRITICAL_FLAGS.flatMap((flag) => [
          episode.criticalFlags[flag.key],
          episode.criticalEvidenceTurns[flag.key],
          episode.criticalEvidence[flag.key],
        ]),
        episode.comments,
      ]);
    const csv = [columns, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `najah-annotations-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const completedByMe = episodes.filter((episode) => episode.annotationStatus === "complete").length;
  const draftsByMe = episodes.filter((episode) => episode.annotationStatus === "draft").length;
  const notStartedByMe = episodes.length - completedByMe - draftsByMe;
  const judgeRandomEpisodes = reviewLayer === "judge"
    ? episodes.filter((episode) => episode.judgeBaseAssignment === rater.assignmentCohort)
    : [];
  const judgeRandomNotStarted = judgeRandomEpisodes.filter(
    (episode) => episode.annotationStatus === null,
  ).length;
  const judgeRandomDrafts = judgeRandomEpisodes.filter(
    (episode) => episode.annotationStatus === "draft",
  ).length;
  const judgeRandomCompleted = judgeRandomEpisodes.filter(
    (episode) => episode.annotationStatus === "complete",
  ).length;
  const judgeRandomRemaining = judgeRandomNotStarted + judgeRandomDrafts;
  const mismatchEpisodes = episodes.filter((episode) => episode.primaryMismatch);
  const mismatchNotStarted = mismatchEpisodes.filter(
    (episode) => episode.annotationStatus === null,
  ).length;
  const mismatchDrafts = mismatchEpisodes.filter(
    (episode) => episode.annotationStatus === "draft",
  ).length;
  const mismatchCompleted = mismatchEpisodes.filter(
    (episode) => episode.annotationStatus === "complete",
  ).length;
  const mismatchRemaining = mismatchNotStarted + mismatchDrafts;
  const fullyRated = episodes.filter(
    (episode) => episode.completedRaterCount >= requiredRatingsPerEpisode,
  ).length;
  const queueCount = episodes.filter(
    (episode) =>
      episode.annotationStatus !== "complete" &&
      episode.completedRaterCount < requiredRatingsPerEpisode &&
      (reviewLayer !== "judge" || episode.judgeBaseAssignment === rater.assignmentCohort),
  ).length;
  const mismatchCount = mismatchEpisodes.length;
  const viewCounts: Record<ViewFilter, number> = {
    queue: queueCount,
    drafts: draftsByMe,
    completed: completedByMe,
    mismatches: mismatchCount,
    all: episodes.length,
  };
  const availableViews: ViewFilter[] = reviewLayer === "judge"
    ? ["queue", "mismatches", "drafts", "completed", "all"]
    : ["queue", "drafts", "completed", "all"];
  const progressEpisodes = episodes.filter((episode) => {
    if (progressView === "all") return true;
    if (progressView === "mismatches") return episode.primaryMismatch;
    if (progressView === "random") {
      return episode.judgeBaseAssignment === rater.assignmentCohort;
    }
    if (progressView === "queue") {
      return (
        episode.annotationStatus !== "complete" &&
        episode.completedRaterCount < requiredRatingsPerEpisode
      );
    }
    if (progressView === "complete") return episode.annotationStatus === "complete";
    if (progressView === "draft") return episode.annotationStatus === "draft";
    return episode.annotationStatus === null;
  });
  const selectedVisibleDraftIds = progressEpisodes
    .filter((episode) => episode.annotationStatus === "draft" && selectedDraftIds.has(episode.episodeId))
    .map((episode) => episode.episodeId);
  const allVisibleDraftsSelected =
    progressView === "draft" &&
    progressEpisodes.length > 0 &&
    selectedVisibleDraftIds.length === progressEpisodes.length;
  const progressListTitle =
    progressView === "all"
      ? "All episodes"
      : progressView === "queue"
        ? reviewLayer === "judge" ? "Random assignments remaining" : "My queue"
        : progressView === "random"
          ? "Random assignments"
        : progressView === "mismatches"
          ? "Mismatch reviews"
        : progressView === "complete"
          ? "Completed by you"
          : progressView === "draft"
            ? "In progress"
            : "Not yet started";
  const currentIndex = filteredEpisodes.findIndex((episode) => episode.episodeId === selectedId);
  const direction = current?.language === "ar" ? "rtl" : "ltr";
  const turns = transcriptTurns(current?.transcript || "");

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div>
            <strong>Najah Review Studio</strong>
            <span>Human evaluation workspace</span>
          </div>
        </div>
        <div className="rater-actions">
          <div className="rater-chip">
            <span className="avatar">{rater.displayName.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{rater.displayName}</strong>
              <small>
                {rater.email} · {userAccessLabel(rater.role, rater.canRate)}
                {rater.role === "rater" ? ` · ${assignmentCohortLabel(rater.assignmentCohort)}` : ""}
              </small>
            </span>
          </div>
          {rater.role === "admin" && (
            <Link href="/admin" className="admin-dashboard-link">Dashboard</Link>
          )}
          <button className="sign-out-button" onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>

      <aside className="sidebar">
        {readOnly ? (
          <section className="viewer-access-card">
            <p className="eyebrow">{rater.role === "admin" ? "Admin access" : "Viewer access"}</p>
            <h2>{rater.role === "admin" ? "Rater status is off" : "Read-only dataset"}</h2>
            <p>
              You can inspect every conversation, use filters, and view translations.
              {rater.role === "admin"
                ? " Add rater status from the dashboard to save or submit ratings."
                : " Ratings cannot be changed or submitted."}
            </p>
          </section>
        ) : (
          <>
            {reviewLayer === "judge" ? (
              <section className="progress-card judge-progress-card" aria-label="Judge review progress">
                <div className="progress-heading">
                  <span>Judge review progress</span>
                  <strong>{completedByMe}/{episodes.length}</strong>
                </div>

                <button
                  type="button"
                  className="judge-progress-group"
                  onClick={() => openViewList("queue")}
                  aria-haspopup="dialog"
                >
                  <span className="judge-progress-group-heading">
                    <strong>Random assignments</strong>
                    <small>Total {judgeRandomEpisodes.length}</small>
                  </span>
                  <span className="judge-progress-statuses">
                    <span><strong>{judgeRandomNotStarted}</strong>Not started</span>
                    <span><strong>{judgeRandomDrafts}</strong>Draft</span>
                    <span><strong>{judgeRandomCompleted}</strong>Done</span>
                  </span>
                  <span className="judge-progress-remaining">
                    <strong>{judgeRandomRemaining}</strong> remaining
                  </span>
                </button>

                <button
                  type="button"
                  className="judge-progress-group"
                  onClick={() => openViewList("mismatches")}
                  aria-haspopup="dialog"
                >
                  <span className="judge-progress-group-heading">
                    <strong>Mismatch reviews</strong>
                    <small>Total {mismatchCount}</small>
                  </span>
                  <span className="judge-progress-statuses">
                    <span><strong>{mismatchNotStarted}</strong>Not started</span>
                    <span><strong>{mismatchDrafts}</strong>Draft</span>
                    <span><strong>{mismatchCompleted}</strong>Done</span>
                  </span>
                  <span className="judge-progress-remaining">
                    <strong>{mismatchRemaining}</strong> remaining
                  </span>
                </button>

                <p className="judge-progress-note">
                  One review can appear in both sections when a random assignment also has a mismatch.
                </p>
              </section>
            ) : (
              <button
                type="button"
                className="progress-card progress-card-button"
                onClick={() => {
                  setProgressView("not_started");
                  setProgressOpen(true);
                }}
                aria-haspopup="dialog"
                aria-expanded={progressOpen}
              >
                <div className="progress-heading"><span>My progress</span><strong>{completedByMe}/{episodes.length}</strong></div>
                <div className="progress-track"><span style={{ width: `${episodes.length ? (completedByMe / episodes.length) * 100 : 0}%` }} /></div>
                <div className="progress-stats">
                  <span><strong>{draftsByMe}</strong> drafts</span>
                  <span><strong>{fullyRated}</strong> fully rated</span>
                </div>
                <span className="progress-card-action">View episode list <span aria-hidden="true">→</span></span>
              </button>
            )}

            <nav className="view-tabs" aria-label="Annotation views">
              {availableViews.map((view) => (
                <button key={view} className={viewFilter === view ? "active" : ""} onClick={() => openViewList(view)}>
                  <span>
                    {view === "queue"
                      ? reviewLayer === "judge" ? "Random assignments" : "My queue"
                      : view === "mismatches"
                        ? "Mismatch reviews"
                        : view[0].toUpperCase() + view.slice(1)}
                  </span>
                  <strong>{viewCounts[view]}</strong>
                </button>
              ))}
            </nav>
          </>
        )}

        <div className="filter-stack">
          <label>
            <span>Module</span>
            <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
              <option value="all">All modules</option>
              {modules.map((module) => <option key={module} value={module}>{MODULE_LABELS[module] || module}</option>)}
            </select>
          </label>
          <label>
            <span>Treatment assignment</span>
            <select value={treatmentFilter} onChange={(event) => setTreatmentFilter(event.target.value)}>
              <option value="all">All treatments</option>
              {TREATMENT_VALUES.map((treatment) => (
                <option key={treatment} value={treatment}>{treatmentLabel(treatment)}</option>
              ))}
              {hasUnknownTreatment && <option value="unknown">Treatment not supplied</option>}
            </select>
          </label>
        </div>

        <section className="data-tools">
          <h2>Dataset</h2>
          <p>
            <strong>{episodes.length}</strong> episode{episodes.length === 1 ? "" : "s"} in this account&apos;s
            {rater.role === "rater" ? " assigned review queue" : " dataset view"}.
          </p>
          {rater.role === "admin" && (
            <Link className="text-button" href="/admin#rating-exports">Open export centre</Link>
          )}
          {!readOnly && (
            <button className="text-button" onClick={exportMyWork} disabled={!draftsByMe && !completedByMe}>Export my work</button>
          )}
        </section>
      </aside>

      <main className="workspace">
        {(error || notice) && (
          <div className={error ? "toast error" : "toast success"} role="status">
            <span>{error || notice}</span>
            <button aria-label="Dismiss message" onClick={() => { setError(""); setNotice(""); }}>×</button>
          </div>
        )}

        {progressOpen && (
          <div className="progress-overlay">
            <button
              type="button"
              className="progress-overlay-dismiss"
              aria-label="Close review progress"
              onClick={() => setProgressOpen(false)}
            />
            <section
              className="progress-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="progress-dialog-title"
            >
              <header className="progress-dialog-header">
                <div>
                  <p className="eyebrow">Your own ratings</p>
                  <h1 id="progress-dialog-title">Review progress</h1>
                  <p>Select any episode to open it in the evaluation workspace.</p>
                </div>
                <button
                  type="button"
                  className="progress-close"
                  onClick={() => setProgressOpen(false)}
                  aria-label="Close progress list"
                >
                  ×
                </button>
              </header>

              <div className="progress-summary" aria-label="Progress totals">
                <button type="button" onClick={() => setProgressView("complete")} className={progressView === "complete" ? "active" : ""}>
                  <strong>{completedByMe}</strong><span>Done</span>
                </button>
                <button type="button" onClick={() => setProgressView("draft")} className={progressView === "draft" ? "active" : ""}>
                  <strong>{draftsByMe}</strong><span>Drafts</span>
                </button>
                <button type="button" onClick={() => setProgressView("not_started")} className={progressView === "not_started" ? "active" : ""}>
                  <strong>{notStartedByMe}</strong><span>Not started</span>
                </button>
              </div>

              <div className="progress-list-heading">
                <strong>{progressListTitle}</strong>
                <span>{progressEpisodes.length} episode{progressEpisodes.length === 1 ? "" : "s"}</span>
              </div>

              {progressView === "draft" && progressEpisodes.length > 0 && (
                <div className="draft-bulk-toolbar">
                  <label>
                    <input
                      type="checkbox"
                      checked={allVisibleDraftsSelected}
                      onChange={(event) => toggleAllVisibleDrafts(event.target.checked)}
                    />
                    <span>Select all drafts</span>
                  </label>
                  <span>{selectedVisibleDraftIds.length} selected</span>
                  <button
                    type="button"
                    className="danger-text-button"
                    disabled={!selectedVisibleDraftIds.length}
                    onClick={() => void requestDraftDeletion(
                      selectedVisibleDraftIds,
                      `${selectedVisibleDraftIds.length} selected draft${selectedVisibleDraftIds.length === 1 ? "" : "s"}`,
                    )}
                  >
                    Delete selected
                  </button>
                  <button
                    type="button"
                    className="danger-text-button"
                    onClick={() => void requestDraftDeletion(
                      progressEpisodes.map((episode) => episode.episodeId),
                      `all ${progressEpisodes.length} draft${progressEpisodes.length === 1 ? "" : "s"}`,
                    )}
                  >
                    Clear all drafts
                  </button>
                </div>
              )}

              <div className="progress-episode-list">
                {progressEpisodes.length ? progressEpisodes.map((episode) => (
                  <div
                    className={`progress-episode-row-shell ${progressView === "draft" ? "selectable" : ""}`}
                    key={episode.episodeId}
                  >
                    {progressView === "draft" && (
                      <label className="draft-row-selector" aria-label={`Select draft ${episode.episodeId}`}>
                        <input
                          type="checkbox"
                          checked={selectedDraftIds.has(episode.episodeId)}
                          onChange={(event) => toggleDraftSelection(episode.episodeId, event.target.checked)}
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      className="progress-episode-row"
                      onClick={() => void openEpisodeFromProgress(episode)}
                    >
                      <span
                        className={`progress-status-dot status-${episode.annotationStatus ?? "not_started"}`}
                        aria-hidden="true"
                      />
                      <span className="progress-episode-copy">
                        <strong>{episode.episodeId}</strong>
                        <small>
                          {MODULE_LABELS[episode.module] || episode.module} · {treatmentLabel(episode.treatment)}
                          {reviewLayer === "judge" && episode.primarySeriousMismatch
                            ? " · Serious mismatch"
                            : reviewLayer === "judge" && episode.primaryMismatch
                              ? " · Primary-rating mismatch"
                            : ""}
                        </small>
                      </span>
                      <span className={`progress-row-status status-${episode.annotationStatus ?? "not_started"}`}>
                        {episode.annotationStatus === "complete" ? "Done" : episode.annotationStatus === "draft" ? "Draft" : "Not started"}
                      </span>
                      <span className="progress-open-arrow" aria-hidden="true">→</span>
                    </button>
                  </div>
                )) : (
                  <div className="progress-list-empty">
                    <span>✓</span>
                    <p>No episodes in this list.</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {draftDeleteRequest && (
          <div className="confirmation-overlay">
            <button
              type="button"
              className="confirmation-overlay-dismiss"
              aria-label="Cancel draft deletion"
              onClick={() => !deletingDrafts && setDraftDeleteRequest(null)}
            />
            <section
              className="confirmation-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-drafts-title"
              aria-describedby="delete-drafts-description"
            >
              <p className="eyebrow">Permanent deletion</p>
              <h2 id="delete-drafts-title">Delete {draftDeleteRequest.label}?</h2>
              <p id="delete-drafts-description">
                This cannot be undone in Najah Review Studio. If you want to keep a copy,
                download your export before deleting the draft data.
              </p>
              <div className="confirmation-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setDraftDeleteRequest(null)}
                  disabled={deletingDrafts}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={exportMyWork}
                  disabled={deletingDrafts}
                >
                  Download my export
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => void deleteRequestedDrafts()}
                  disabled={deletingDrafts}
                  aria-busy={deletingDrafts}
                >
                  {deletingDrafts ? "Deleting…" : "Delete permanently"}
                </button>
              </div>
            </section>
          </div>
        )}

        {loading ? (
          <div className="loading-state"><span className="spinner" />Loading the review queue…</div>
        ) : !current || currentIndex < 0 ? (
          <section className="empty-state">
            <div className="empty-icon">✓</div>
            <h1>
              {!episodes.length
                ? rater.role === "rater" && !isAssignedCohort(rater.assignmentCohort)
                  ? "Your study assignment is pending"
                  : "Your review workspace is ready"
                : viewFilter === "drafts" && !filteredEpisodes.length
                  ? "No drafts yet"
                  : viewFilter === "completed" && !filteredEpisodes.length
                    ? "No completed episodes yet"
                : viewFilter === "mismatches" && !filteredEpisodes.length
                      ? "No mismatch reviews"
                    : viewFilter === "queue" && !filteredEpisodes.length
                      ? reviewLayer === "judge" ? "Your random assignments are complete" : "Your queue is complete"
                      : "No episodes match these filters"}
            </h1>
            <p>
              {!episodes.length
                ? rater.role === "rater" && !isAssignedCohort(rater.assignmentCohort)
                  ? "An administrator must assign you to Group A, Group B, Group C, Judge 1, or Judge 2 before episodes appear."
                  : "The built-in dataset could not be loaded. Refresh the page to try again."
                : viewFilter === "drafts" && !filteredEpisodes.length
                  ? "Ratings saved before submission will appear in Drafts."
                  : viewFilter === "completed" && !filteredEpisodes.length
                    ? "Ratings you submit will appear in Completed."
                : viewFilter === "mismatches" && !filteredEpisodes.length
                      ? "A review will appear here after both primary raters submit different scores, task-status judgments, or critical-failure judgments."
                    : viewFilter === "queue" && !filteredEpisodes.length
                      ? reviewLayer === "judge"
                        ? "There are no random assignments currently waiting for your review."
                        : "There are no episodes currently waiting for your rating."
                      : "Change a filter or choose another list."}
            </p>
          </section>
        ) : (
          <>
            <div className="episode-toolbar">
              <div>
                <span className="module-badge">{MODULE_LABELS[current.module] || current.module}</span>
                <span className={`treatment-badge treatment-${current.treatment}`}>{treatmentLabel(current.treatment)}</span>
                {reviewLayer === "judge" && current.primaryMismatch && (
                  <span className="mismatch-badge">
                    {current.primarySeriousMismatch
                      ? "Serious mismatch · review required"
                      : "Primary-rating mismatch"}
                  </span>
                )}
                <span className="episode-id">{current.episodeId}</span>
              </div>
              <div className="episode-nav">
                <span>{currentIndex + 1} of {filteredEpisodes.length}</span>
                <button
                  onClick={() => void navigate(-1)}
                  disabled={currentIndex <= 0 || navigationDirection !== null}
                  aria-label="Previous episode"
                  aria-busy={navigationDirection === -1}
                >
                  {navigationDirection === -1 ? "…" : "←"}
                </button>
                <button
                  onClick={() => void navigate(1)}
                  disabled={currentIndex >= filteredEpisodes.length - 1 || navigationDirection !== null}
                  aria-label="Next episode"
                  aria-busy={navigationDirection === 1}
                >
                  {navigationDirection === 1 ? "…" : "→"}
                </button>
              </div>
            </div>

            <div className={`review-layout${readOnly ? " viewer-layout" : ""}`}>
              <article className="conversation-panel">
                <header>
                  <p className="eyebrow">Module objective</p>
                  <h1>{current.moduleObjective || `Evaluate the ${MODULE_LABELS[current.module] || current.module} guidance.`}</h1>
                  <div className="independence-note">
                    <span>◎</span> {current.completedRaterCount}/{requiredRatingsPerEpisode}{" "}
                    {reviewLayer === "judge" ? "independent judge reviews complete" : "independent primary ratings complete"}
                  </div>
                  {reviewLayer === "judge" && current.primaryMismatch && (
                    <div className="judge-mismatch-alert" role="status">
                      <strong>
                        {current.primarySeriousMismatch
                          ? "Serious primary-rating mismatch—judge review required"
                          : "Primary-rating mismatch in the random review sample"}
                      </strong>
                      {current.primarySeriousMismatch ? (
                        <span>
                          The primary ratings differ on a major score contrast, task-status
                          judgment, or critical-failure judgment. Their individual scores
                          remain hidden so you can make an independent assessment.
                        </span>
                      ) : (
                        <span>
                          Both primary ratings are complete and differ on at least one
                          judgment. Their individual scores remain hidden so you can make
                          an independent assessment.
                        </span>
                      )}
                    </div>
                  )}
                </header>

                <section className="translation-toolbar" aria-label="Conversation language view">
                  <div>
                    <strong>Conversation view</strong>
                    <span>Translate the transcript and relevant prior context while keeping the original available.</span>
                  </div>
                  <div className="translation-view-options" role="group" aria-label="Choose conversation language">
                    <button
                      type="button"
                      className={transcriptView === "original" ? "active" : ""}
                      onClick={() => setTranscriptView("original")}
                    >
                      Original
                    </button>
                    <button
                      type="button"
                      className={transcriptView === "english" ? "active" : ""}
                      onClick={() => void showEnglishTranslation()}
                      disabled={translationStatus === "preparing" || translationStatus === "translating"}
                    >
                      {translationStatus === "preparing" || translationStatus === "translating"
                        ? "Translating…"
                        : "English translation"}
                    </button>
                  </div>
                  {(translationStatus === "preparing" || translationStatus === "translating") && (
                    <div className="translation-progress" aria-live="polite">
                      <span style={{ width: `${translationProgress}%` }} />
                      <small>{translationMessage}</small>
                    </div>
                  )}
                  {(translationStatus === "error" ||
                    (translationStatus === "ready" && Boolean(translationMessage))) && (
                    <p className="translation-message" role="status">{translationMessage}</p>
                  )}
                  {transcriptView === "english" && translationStatus === "ready" && (
                    <p className="translation-note">
                      Machine translation for reading support. Use the original text when meaning is uncertain; turn numbers are unchanged.
                    </p>
                  )}
                </section>

                <details className="context-card">
                  <summary>Relevant prior context</summary>
                  <p
                    dir={transcriptView === "english" ? "ltr" : direction}
                    aria-label={
                      transcriptView === "english"
                        ? "English translation of relevant prior context"
                        : "Original relevant prior context"
                    }
                  >
                    {transcriptView === "english" && translationStatus === "ready"
                      ? translatedPriorContext || priorContextOrExplanation(current.priorContext)
                      : priorContextOrExplanation(current.priorContext)}
                  </p>
                </details>

                <section
                  className="transcript"
                  aria-label={transcriptView === "english" ? "English translation of episode transcript" : "Original episode transcript"}
                  dir={transcriptView === "english" ? "ltr" : direction}
                >
                  {(transcriptView === "english" ? translatedTurns : turns).map((turn, index) => (
                    <div key={`${turn.turn}-${index}`} className={`turn ${turn.speaker === "USER" ? "user-turn" : "najah-turn"}`}>
                      <div className="speaker-row">
                        <span className="speaker">{turn.speaker === "USER" ? "Participant" : "Najah"}</span>
                        <span>Turn {turn.turn}</span>
                      </div>
                      <p>{turn.text}</p>
                      {transcriptView === "english" && turn.translationState === "unavailable" && (
                        <span className="turn-translation-status">
                          Translation unavailable — original shown
                        </span>
                      )}
                    </div>
                  ))}
                </section>
              </article>

              {!readOnly && (
              <aside className="rating-panel">
                <div className="rating-header">
                  <div><p className="eyebrow">Your evaluation</p><h2>Rate this episode</h2></div>
                  <span className={`save-state ${saveState}`}>{saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved" : saveState === "error" ? "Save failed" : "Saved"}</span>
                </div>
                <div className="scale-legend">
                  <span>1 · Material failure</span><span>2 · Partial / minor issue</span><span>3 · Meets anchor</span>
                </div>
                <p className="rubric-instruction">
                  A score of 1, 2, 3, or N/A is required for every dimension. Evidence turn numbers are optional for routine scores. Evidence and a short explanation are required for selected critical failures; a reason is required when skipping. Use N/A only when the dimension genuinely cannot be assessed.
                </p>

                <section className="evaluation-partition najah-performance-partition" aria-labelledby="najah-performance-heading">
                  <header className="evaluation-partition-header">
                    <span className="evaluation-partition-letter" aria-hidden="true">A</span>
                    <div>
                      <p className="eyebrow">Rate Najah</p>
                      <h3 id="najah-performance-heading">Najah’s performance</h3>
                      <p>Assess what Najah said and did during the module episode.</p>
                    </div>
                  </header>

                  {RUBRIC_SECTIONS.map((section, sectionIndex) => (
                    <section className="rubric-section" key={section}>
                      <div className="rubric-section-heading">
                        <p className="eyebrow">A.{sectionIndex + 1} {section}</p>
                        <span>
                          {section === "Najah response-quality"
                            ? "Assess the quality of Najah’s responses in this episode."
                            : "Give one score per dimension for the complete module episode."}
                        </span>
                      </div>
                      {RUBRIC_DIMENSIONS.filter((dimension) => dimension.section === section).map((dimension) => (
                        <ScoreCard
                          key={dimension.key}
                          dimension={dimension}
                          score={draft.scores[dimension.key]}
                          evidenceTurns={draft.evidenceTurns[dimension.key]}
                          justification={draft.justifications[dimension.key]}
                          onScoreChange={(score) => updateScore(dimension.key, score)}
                          onEvidenceChange={(value) => updateEvidenceTurns(dimension.key, value)}
                          onJustificationChange={(value) => updateJustification(dimension.key, value)}
                        />
                      ))}
                    </section>
                  ))}

                  <section className="rubric-section critical-section">
                    <div className="rubric-section-heading">
                      <p className="eyebrow">A.3 Critical-failure screening</p>
                      <span>Screen once, then identify every applicable failure only when the answer is Yes.</span>
                    </div>
                    <CriticalFailureCard
                      observed={draft.criticalFailureObserved}
                      flags={draft.criticalFlags}
                      evidence={draft.criticalEvidence}
                      evidenceTurns={draft.criticalEvidenceTurns}
                      onObservedChange={updateCriticalFailureObserved}
                      onFlagChange={updateCriticalFlag}
                      onEvidenceChange={updateCriticalEvidence}
                      onEvidenceTurnsChange={updateCriticalEvidenceTurns}
                    />
                  </section>

                  <section className="rubric-section gender-context-section">
                    <div className="rubric-section-heading">
                      <p className="eyebrow">A.4 Gender-related context</p>
                      <span>Record whether gender context arose and how Najah handled it.</span>
                    </div>
                    <GenderContextCard
                      value={draft.genderContextHandling}
                      onChange={(value) => updateDraftField("genderContextHandling", value)}
                    />
                  </section>

                  <section className="rubric-section qualitative-section">
                    <div className="rubric-section-heading">
                      <p className="eyebrow">A.5 Optional qualitative reflections</p>
                      <span>These responses support process evaluation and are not included in the numerical quality score.</span>
                    </div>
                    <label className="form-field comments-field">
                      <span>What, if anything, was the most useful thing Najah did in this episode? <small>optional</small></span>
                      <textarea value={draft.mostUsefulThing} onChange={(event) => updateDraftField("mostUsefulThing", event.target.value)} rows={3} />
                    </label>
                    <label className="form-field comments-field">
                      <span>What is one thing Najah could have done or said differently to improve this episode? <small>optional</small></span>
                      <textarea value={draft.suggestedImprovement} onChange={(event) => updateDraftField("suggestedImprovement", event.target.value)} rows={3} />
                    </label>
                  </section>
                </section>

                <section className="evaluation-partition participant-partition" aria-labelledby="participant-response-heading">
                  <header className="evaluation-partition-header">
                    <span className="evaluation-partition-letter" aria-hidden="true">B</span>
                    <div>
                      <p className="eyebrow">Observe the participant</p>
                      <h3 id="participant-response-heading">Participant response</h3>
                      <p>Record the participant’s observable responses during the module episode.</p>
                    </div>
                  </header>

                  <section className="rubric-section participant-response-section">
                    <div className="rubric-section-heading">
                      <p className="eyebrow">B.1 Observable participant behaviour</p>
                      <span>Record every behaviour observed at least once; optional turn references help locate the supporting message.</span>
                    </div>
                    <ParticipantBehaviourCard
                      behaviours={draft.participantBehaviours}
                      other={draft.participantBehaviourOther}
                      onChange={updateParticipantBehaviour}
                      onOtherChange={(value) => updateDraftField("participantBehaviourOther", value)}
                    />
                  </section>

                  <section className="rubric-section participant-response-section">
                    <div className="rubric-section-heading">
                      <p className="eyebrow">B.2 Explicitly expressed participant reaction</p>
                      <span>Record reactions that the participant expressed directly; optional turn references help locate the supporting message.</span>
                    </div>
                    <ParticipantReactionCard
                      reactions={draft.participantReactions}
                      other={draft.participantReactionOther}
                      onChange={updateParticipantReaction}
                      onOtherChange={(value) => updateDraftField("participantReactionOther", value)}
                    />
                  </section>
                </section>

                <section className="evaluation-partition outcome-partition" aria-labelledby="module-outcome-heading">
                  <header className="evaluation-partition-header">
                    <span className="evaluation-partition-letter" aria-hidden="true">C</span>
                    <div>
                      <p className="eyebrow">Record the outcome</p>
                      <h3 id="module-outcome-heading">Module-episode outcome</h3>
                      <p>Describe what happened to the module task and how the available episode ended.</p>
                    </div>
                  </header>

                  <section className="rubric-section episode-ending-section">
                    <div className="rubric-section-heading">
                      <p className="eyebrow">C.1 Task outcome</p>
                    </div>
                    <TaskStatusCard
                      status={draft.taskStatus}
                      onStatusChange={updateTaskStatus}
                    />
                  </section>

                  <section className="rubric-section episode-ending-section">
                    <div className="rubric-section-heading">
                      <p className="eyebrow">C.2 Episode ending</p>
                    </div>
                    <EpisodeEndingCard value={draft.episodeEnding} onChange={updateEpisodeEnding} />
                  </section>
                </section>

                <label className="form-field comments-field">
                  <span>Additional adjudication note <small>optional</small></span>
                  <textarea value={draft.comments} onChange={(event) => updateComments(event.target.value)} placeholder="Add context not already captured in the required evidence fields." rows={4} />
                </label>

                <label className="form-field skip-reason-field">
                  <span>Reason for skipping this episode <small className="required-label">required to skip</small></span>
                  <textarea
                    id="skip-reason"
                    value={draft.skipReason}
                    onChange={(event) => updateSkipReason(event.target.value)}
                    placeholder="Briefly explain why you cannot rate this episode now."
                    rows={3}
                    aria-describedby={skipReasonError ? "skip-reason-error" : undefined}
                    aria-invalid={Boolean(skipReasonError)}
                  />
                  {skipReasonError && (
                    <span className="skip-field-error" id="skip-reason-error" role="alert">
                      {skipReasonError}
                    </span>
                  )}
                </label>

                <div className="rating-actions">
                  {submitError && (
                    <div className="submit-error" role="alert">
                      <strong>Rating not submitted</strong>
                      <span>{submitError}</span>
                    </div>
                  )}
                  {(current.annotationStatus === "draft" || dirty) && (
                    <button
                      className="danger-secondary-button"
                      onClick={() => void requestDraftDeletion([current.episodeId], "this draft")}
                      disabled={saveState === "saving" || skipping}
                    >
                      Clear draft
                    </button>
                  )}
                  <button
                    className="secondary-button"
                    onClick={() => void persist("draft")}
                    disabled={saveState === "saving" || skipping}
                    aria-busy={activeSaveAction === "draft"}
                  >
                    {activeSaveAction === "draft" ? "Saving…" : "Save draft"}
                  </button>
                  <button
                    className="secondary-button skip-button"
                    onClick={() => void skipAndAdvance()}
                    disabled={saveState === "saving" || skipping || filteredEpisodes.length < 2 || current.annotationStatus === "complete"}
                    aria-busy={skipping}
                  >
                    {skipping ? "Skipping…" : <>Skip &amp; next <span>→</span></>}
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => void submitAndAdvance()}
                    disabled={saveState === "saving" || skipping}
                    aria-busy={activeSaveAction === "complete"}
                  >
                    {activeSaveAction === "complete" ? "Submitting…" : <>Submit &amp; next <span>→</span></>}
                  </button>
                </div>
              </aside>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
