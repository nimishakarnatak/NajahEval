"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  STUDENT_STATUS_VALUES,
  TREATMENT_VALUES,
  studentStatusLabel,
  treatmentLabel,
} from "@/lib/episode-dimensions";
import { languageBadgeTone, languageLabel } from "@/lib/language";
import {
  CRITICAL_FLAGS,
  CRITICAL_FLAG_KEYS,
  CriticalFlagKey,
  CriticalFlagValue,
  DIMENSION_KEYS,
  DimensionKey,
  DimensionScore,
  RUBRIC_DIMENSIONS,
  RubricDimension,
  RubricSection,
  keyedRecord,
} from "@/lib/rubric";

type AnnotationDraft = {
  scores: Record<DimensionKey, DimensionScore>;
  evidenceTurns: Record<DimensionKey, string>;
  justifications: Record<DimensionKey, string>;
  criticalFlags: Record<CriticalFlagKey, CriticalFlagValue>;
  criticalEvidence: Record<CriticalFlagKey, string>;
  comments: string;
};

type Episode = AnnotationDraft & {
  episodeId: string;
  studentStatus: string;
  language: string;
  module: string;
  treatment: string;
  moduleObjective: string;
  priorContext: string;
  transcript: string;
  privacyReviewStatus: string;
  languageReviewStatus: string;
  completedRaterCount: number;
  annotationStatus: "draft" | "complete" | null;
  annotationUpdatedAt: string | null;
};

type Rater = { displayName: string; email: string; role: "admin" | "rater" };
type SaveState = "saved" | "saving" | "unsaved" | "error";
type ViewFilter = "queue" | "drafts" | "completed" | "all";
type ProgressView = "not_started" | "draft" | "complete";

const RUBRIC_SECTIONS: readonly RubricSection[] = [
  "Turn-level assessment",
  "Module-level assessment",
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
    comments: "",
  };
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
    comments: episode.comments ?? "",
  };
}

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function transcriptTurns(transcript: string) {
  const turns: { speaker: "USER" | "NAJAH"; text: string; turn: string }[] = [];
  for (const rawLine of transcript.split(/\r?\n/)) {
    const match = rawLine.match(/^\[TURN\s+(\d+)\]\s+(USER|NAJAH):\s*(.*)$/i);
    if (match) {
      turns.push({
        turn: match[1],
        speaker: match[2].toUpperCase() as "USER" | "NAJAH",
        text: match[3],
      });
    } else if (turns.length && rawLine.trim()) {
      turns[turns.length - 1].text += `\n${rawLine.trim()}`;
    }
  }
  if (!turns.length && transcript.trim()) {
    turns.push({ speaker: "NAJAH", turn: "—", text: transcript.trim() });
  }
  return turns;
}

/**
 * Renders one anchored dimension together with the evidence needed to audit the
 * judgment. A low score or N/A opens a mandatory explanation field.
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
  const requiresScoreExplanation = score === 1 || score === 2;
  const isNotApplicable = score === "na";
  return (
    <section className="score-card">
      <div className="dimension-heading">
        <h4>{dimension.label}</h4>
        <span>{score === null ? "Not scored" : score === "na" ? "N/A selected" : `Score ${score}`}</span>
      </div>

      <details className="rubric-anchors">
        <summary>View scoring anchors</summary>
        <dl>
          {([3, 2, 1] as const).map((anchorScore) => (
            <div key={anchorScore}>
              <dt>{anchorScore}</dt>
              <dd>{dimension.anchors[anchorScore]}</dd>
            </div>
          ))}
        </dl>
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
          <span>Evidence turn number(s) <strong>required</strong></span>
          <input
            value={evidenceTurns}
            onChange={(event) => onEvidenceChange(event.target.value)}
            placeholder="e.g. 002, 004–006"
          />
        </label>
      )}

      {(requiresScoreExplanation || isNotApplicable) && (
        <label className="evidence-field">
          <span>
            {isNotApplicable ? "Why this genuinely cannot be assessed" : `Justification for score ${score}`} <strong>required</strong>
          </span>
          <textarea
            value={justification}
            onChange={(event) => onJustificationChange(event.target.value)}
            placeholder={isNotApplicable ? "Explain why the transcript provides no valid basis for this dimension." : "Briefly explain the evidence supporting this score."}
            rows={3}
          />
        </label>
      )}
    </section>
  );
}

/** Renders one critical-failure decision and conditional evidence requirement. */
function CriticalFlagCard({
  flag,
  value,
  evidence,
  onValueChange,
  onEvidenceChange,
}: {
  flag: (typeof CRITICAL_FLAGS)[number];
  value: CriticalFlagValue;
  evidence: string;
  onValueChange: (value: CriticalFlagValue) => void;
  onEvidenceChange: (value: string) => void;
}) {
  return (
    <fieldset className="critical-flag-card">
      <legend>{flag.label}</legend>
      <p>{flag.trigger}</p>
      <div className="binary-options" aria-label={`${flag.label}, yes or no`}>
        {(["no", "yes"] as const).map((option) => (
          <label key={option} className={value === option ? "selected" : ""}>
            <input
              type="radio"
              name={`critical-${flag.key}`}
              checked={value === option}
              onChange={() => onValueChange(option)}
            />
            {option === "yes" ? "Yes" : "No"}
          </label>
        ))}
      </div>
      {value === "yes" && (
        <label className="evidence-field critical-evidence-field">
          <span>Evidence turn(s) and explanation <strong>required</strong></span>
          <textarea
            value={evidence}
            onChange={(event) => onEvidenceChange(event.target.value)}
            placeholder="e.g. Turn 004 — identify the exact statement and explain why it triggers this flag."
            rows={3}
          />
        </label>
      )}
    </fieldset>
  );
}

export function AnnotatorApp({ initialRater }: { initialRater: Rater }) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [rater, setRater] = useState(initialRater);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<AnnotationDraft>(emptyDraft);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [studentStatusFilter, setStudentStatusFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [treatmentFilter, setTreatmentFilter] = useState("all");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("queue");
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressView, setProgressView] = useState<ProgressView>("not_started");

  const loadEpisodes = useCallback(async (preferredId?: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/episodes", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load episodes.");
      const loaded = payload.episodes as Episode[];
      setEpisodes(loaded);
      setRater(payload.rater ?? initialRater);
      setSelectedId((current) => preferredId || current || loaded[0]?.episodeId || "");
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
    // A change of queue item intentionally resets the local form to the values
    // saved for that item.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(draftFromEpisode(current));
    setDirty(false);
    setSaveState("saved");
  }, [current]);

  const modules = useMemo(
    () => Array.from(new Set(episodes.map((episode) => episode.module))).sort(),
    [episodes],
  );
  const hasUnknownStudentStatus = episodes.some((episode) => episode.studentStatus === "unknown");
  const hasUnknownTreatment = episodes.some((episode) => episode.treatment === "unknown");

  const filteredEpisodes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return episodes.filter((episode) => {
      const matchesSearch =
        !query ||
        episode.episodeId.toLowerCase().includes(query) ||
        episode.transcript.toLowerCase().includes(query) ||
        studentStatusLabel(episode.studentStatus).toLowerCase().includes(query) ||
        languageLabel(episode.language).toLowerCase().includes(query) ||
        treatmentLabel(episode.treatment).toLowerCase().includes(query) ||
        (MODULE_LABELS[episode.module] || episode.module).toLowerCase().includes(query);
      const matchesStudentStatus =
        studentStatusFilter === "all" || episode.studentStatus === studentStatusFilter;
      const matchesModule = moduleFilter === "all" || episode.module === moduleFilter;
      const matchesTreatment =
        treatmentFilter === "all" || episode.treatment === treatmentFilter;
      const matchesView =
        viewFilter === "all" ||
        (viewFilter === "queue" && episode.annotationStatus !== "complete" && episode.completedRaterCount < 2) ||
        (viewFilter === "drafts" && episode.annotationStatus === "draft") ||
        (viewFilter === "completed" && episode.annotationStatus === "complete");
      return matchesSearch && matchesStudentStatus && matchesModule && matchesTreatment && matchesView;
    });
  }, [episodes, moduleFilter, search, studentStatusFilter, treatmentFilter, viewFilter]);

  useEffect(() => {
    if (filteredEpisodes.length && !filteredEpisodes.some((episode) => episode.episodeId === selectedId)) {
      // Filter changes can remove the active episode, so select the first
      // visible item to keep the queue and form consistent.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedId(filteredEpisodes[0].episodeId);
    }
  }, [filteredEpisodes, selectedId]);

  /** Updates a single dimension without replacing evidence for other scores. */
  function updateDimensionText(
    field: "evidenceTurns" | "justifications",
    key: DimensionKey,
    value: string,
  ) {
    setDraft((previous) => ({
      ...previous,
      [field]: { ...previous[field], [key]: value },
    }));
    setDirty(true);
    setSaveState("unsaved");
  }

  /**
   * Changes a dimension score and removes evidence that is no longer relevant.
   * This prevents hidden stale text from appearing in the analysis export.
   */
  function updateScore(key: DimensionKey, score: DimensionScore) {
    setDraft((previous) => ({
      ...previous,
      scores: { ...previous.scores, [key]: score },
      evidenceTurns: score === "na"
        ? { ...previous.evidenceTurns, [key]: "" }
        : previous.evidenceTurns,
      justifications: score === 3
        ? { ...previous.justifications, [key]: "" }
        : previous.justifications,
    }));
    setDirty(true);
    setSaveState("unsaved");
  }

  /** Updates one Yes/No flag or its associated evidence text. */
  function updateCriticalEvidence(key: CriticalFlagKey, value: string) {
    setDraft((previous) => ({
      ...previous,
      criticalEvidence: { ...previous.criticalEvidence, [key]: value },
    }));
    setDirty(true);
    setSaveState("unsaved");
  }

  /** Selecting No clears any evidence that was entered for an earlier Yes. */
  function updateCriticalFlag(key: CriticalFlagKey, value: CriticalFlagValue) {
    setDraft((previous) => ({
      ...previous,
      criticalFlags: { ...previous.criticalFlags, [key]: value },
      criticalEvidence: value === "no"
        ? { ...previous.criticalEvidence, [key]: "" }
        : previous.criticalEvidence,
    }));
    setDirty(true);
    setSaveState("unsaved");
  }

  /** Updates the optional episode-level adjudication note. */
  function updateComments(value: string) {
    setDraft((previous) => ({ ...previous, comments: value }));
    setDirty(true);
    setSaveState("unsaved");
  }

  async function persist(status: "draft" | "complete", quiet = false) {
    if (!current) return false;
    setSaveState("saving");
    try {
      const response = await fetch("/api/annotations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ episodeId: current.episodeId, ...draft, status }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save this annotation.");

      setEpisodes((previous) =>
        previous.map((episode) => {
          if (episode.episodeId !== current.episodeId) return episode;
          const newlyCompleted = status === "complete" && episode.annotationStatus !== "complete";
          return {
            ...episode,
            ...draft,
            annotationStatus: status,
            completedRaterCount: episode.completedRaterCount + (newlyCompleted ? 1 : 0),
            annotationUpdatedAt: new Date().toISOString(),
          };
        }),
      );
      setDirty(false);
      setSaveState("saved");
      if (!quiet) setNotice(status === "complete" ? "Rating submitted." : "Draft saved.");
      return true;
    } catch (requestError) {
      setSaveState("error");
      if (!quiet) setError(requestError instanceof Error ? requestError.message : "Unable to save.");
      return false;
    }
  }

  useEffect(() => {
    if (!dirty || !current) return;
    const timeout = window.setTimeout(() => void persist("draft", true), 1000);
    return () => window.clearTimeout(timeout);
    // `draft` is the intentional autosave trigger. Including `persist` would
    // recreate the timeout on every render because it closes over form state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty, selectedId]);

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
    if (!filteredEpisodes.length) return;
    if (dirty) await persist("draft", true);
    const currentIndex = Math.max(
      0,
      filteredEpisodes.findIndex((episode) => episode.episodeId === selectedId),
    );
    const nextIndex = Math.min(
      filteredEpisodes.length - 1,
      Math.max(0, currentIndex + direction),
    );
    setSelectedId(filteredEpisodes[nextIndex].episodeId);
  }

  async function submitAndAdvance() {
    const saved = await persist("complete");
    if (!saved) return;
    const currentIndex = filteredEpisodes.findIndex((episode) => episode.episodeId === selectedId);
    const next = filteredEpisodes[currentIndex + 1] || filteredEpisodes[0];
    if (next && next.episodeId !== selectedId) setSelectedId(next.episodeId);
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
    setSearch("");
    setStudentStatusFilter("all");
    setModuleFilter("all");
    setTreatmentFilter("all");
    setViewFilter(
      episode.annotationStatus === "complete"
        ? "completed"
        : episode.annotationStatus === "draft"
          ? "drafts"
          : "all",
    );
    setSelectedId(episode.episodeId);
    setProgressOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  function exportMyWork() {
    const columns = [
      "episode_id",
      "student_status",
      "module",
      "treatment",
      "language",
      "annotation_status",
      ...RUBRIC_DIMENSIONS.flatMap((dimension) => [
        `${dimension.key}_score`,
        `${dimension.key}_evidence_turns`,
        `${dimension.key}_justification`,
      ]),
      ...CRITICAL_FLAGS.flatMap((flag) => [
        `${flag.key}_flag`,
        `${flag.key}_evidence_explanation`,
      ]),
      "comments",
    ];
    const rows = episodes
      .filter((episode) => episode.annotationStatus)
      .map((episode) => [
        episode.episodeId,
        studentStatusLabel(episode.studentStatus),
        episode.module,
        treatmentLabel(episode.treatment),
        episode.language,
        episode.annotationStatus,
        ...RUBRIC_DIMENSIONS.flatMap((dimension) => [
          episode.scores[dimension.key],
          episode.evidenceTurns[dimension.key],
          episode.justifications[dimension.key],
        ]),
        ...CRITICAL_FLAGS.flatMap((flag) => [
          episode.criticalFlags[flag.key],
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
  const doubleRated = episodes.filter((episode) => episode.completedRaterCount >= 2).length;
  const progressEpisodes = episodes.filter((episode) => {
    if (progressView === "complete") return episode.annotationStatus === "complete";
    if (progressView === "draft") return episode.annotationStatus === "draft";
    return episode.annotationStatus === null;
  });
  const currentIndex = filteredEpisodes.findIndex((episode) => episode.episodeId === selectedId);
  const direction = current?.language === "ar" ? "rtl" : "ltr";
  const turns = transcriptTurns(current?.transcript || "");

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">ن</div>
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
              <small>{rater.email} · {rater.role === "admin" ? "Admin" : "Rater"}</small>
            </span>
          </div>
          <button className="sign-out-button" onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>

      <aside className="sidebar">
        <button
          type="button"
          className="progress-card progress-card-button"
          onClick={() => setProgressOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={progressOpen}
        >
          <div className="progress-heading"><span>My progress</span><strong>{completedByMe}/{episodes.length}</strong></div>
          <div className="progress-track"><span style={{ width: `${episodes.length ? (completedByMe / episodes.length) * 100 : 0}%` }} /></div>
          <div className="progress-stats">
            <span><strong>{draftsByMe}</strong> drafts</span>
            <span><strong>{doubleRated}</strong> double-rated</span>
          </div>
          <span className="progress-card-action">View episode list <span aria-hidden="true">→</span></span>
        </button>

        <nav className="view-tabs" aria-label="Annotation views">
          {(["queue", "drafts", "completed", "all"] as ViewFilter[]).map((view) => (
            <button key={view} className={viewFilter === view ? "active" : ""} onClick={() => setViewFilter(view)}>
              {view === "queue" ? "My queue" : view[0].toUpperCase() + view.slice(1)}
            </button>
          ))}
        </nav>

        <div className="filter-stack">
          <label>
            <span>Find an episode</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ID, module, or text" />
          </label>
          <label>
            <span>Student status</span>
            <select value={studentStatusFilter} onChange={(event) => setStudentStatusFilter(event.target.value)}>
              <option value="all">All student statuses</option>
              {STUDENT_STATUS_VALUES.map((status) => (
                <option key={status} value={status}>{studentStatusLabel(status)}</option>
              ))}
              {hasUnknownStudentStatus && <option value="unknown">Status not supplied</option>}
            </select>
          </label>
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
          <p><strong>{episodes.length}</strong> reviewed episodes are built in and shared with every rater.</p>
          <button className="text-button" onClick={exportMyWork} disabled={!draftsByMe && !completedByMe}>Export my work</button>
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
          <div
            className="progress-overlay"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) setProgressOpen(false);
            }}
          >
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
                <strong>
                  {progressView === "complete" ? "Completed by you" : progressView === "draft" ? "In progress" : "Not yet started"}
                </strong>
                <span>{progressEpisodes.length} episode{progressEpisodes.length === 1 ? "" : "s"}</span>
              </div>

              <div className="progress-episode-list">
                {progressEpisodes.length ? progressEpisodes.map((episode) => (
                  <button
                    type="button"
                    className="progress-episode-row"
                    key={episode.episodeId}
                    onClick={() => void openEpisodeFromProgress(episode)}
                  >
                    <span className={`progress-status-dot status-${progressView}`} aria-hidden="true" />
                    <span className="progress-episode-copy">
                      <strong>{episode.episodeId}</strong>
                      <small>
                        {MODULE_LABELS[episode.module] || episode.module} · {studentStatusLabel(episode.studentStatus)} · {treatmentLabel(episode.treatment)}
                      </small>
                    </span>
                    <span className={`language-badge language-${languageBadgeTone(episode.language)}`}>{languageLabel(episode.language)}</span>
                    <span className="progress-open-arrow" aria-hidden="true">→</span>
                  </button>
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

        {loading ? (
          <div className="loading-state"><span className="spinner" />Loading the review queue…</div>
        ) : !current ? (
          <section className="empty-state">
            <div className="empty-icon">✓</div>
            <h1>{episodes.length ? "No episodes match these filters" : "Your review workspace is ready"}</h1>
            <p>{episodes.length ? "Change a filter or return to My queue." : "The built-in dataset could not be loaded. Refresh the page to try again."}</p>
          </section>
        ) : (
          <>
            <div className="episode-toolbar">
              <div>
                <span className="student-status-badge">{studentStatusLabel(current.studentStatus)}</span>
                <span className="module-badge">{MODULE_LABELS[current.module] || current.module}</span>
                <span className={`treatment-badge treatment-${current.treatment}`}>{treatmentLabel(current.treatment)}</span>
                <span className={`language-badge language-${languageBadgeTone(current.language)}`}>{languageLabel(current.language)}</span>
                <span className="episode-id">{current.episodeId}</span>
              </div>
              <div className="episode-nav">
                <span>{currentIndex + 1} of {filteredEpisodes.length}</span>
                <button onClick={() => void navigate(-1)} disabled={currentIndex <= 0} aria-label="Previous episode">←</button>
                <button onClick={() => void navigate(1)} disabled={currentIndex >= filteredEpisodes.length - 1} aria-label="Next episode">→</button>
              </div>
            </div>

            <div className="review-layout">
              <article className="conversation-panel">
                <header>
                  <p className="eyebrow">Module objective</p>
                  <h1>{current.moduleObjective || `Evaluate the ${MODULE_LABELS[current.module] || current.module} guidance.`}</h1>
                  <div className="independence-note"><span>◎</span> {current.completedRaterCount}/2 independent ratings complete</div>
                </header>

                {current.priorContext && (
                  <details className="context-card">
                    <summary>Relevant prior context</summary>
                    <p dir={direction}>{current.priorContext}</p>
                  </details>
                )}

                <section className="transcript" aria-label="Episode transcript" dir={direction}>
                  {turns.map((turn, index) => (
                    <div key={`${turn.turn}-${index}`} className={`turn ${turn.speaker === "USER" ? "user-turn" : "najah-turn"}`}>
                      <div className="speaker-row">
                        <span className="speaker">{turn.speaker === "USER" ? "Participant" : "Najah"}</span>
                        <span>Turn {turn.turn}</span>
                      </div>
                      <p>{turn.text}</p>
                    </div>
                  ))}
                </section>
              </article>

              <aside className="rating-panel">
                <div className="rating-header">
                  <div><p className="eyebrow">Your evaluation</p><h2>Rate this episode</h2></div>
                  <span className={`save-state ${saveState}`}>{saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved" : saveState === "error" ? "Save failed" : "Saved"}</span>
                </div>
                <div className="scale-legend">
                  <span>1 · Material failure</span><span>2 · Partial / minor issue</span><span>3 · Meets anchor</span>
                </div>
                <p className="rubric-instruction">
                  Cite the relevant turn number(s) for every assessed dimension. Explain every 1 or 2. Use N/A only when the dimension genuinely cannot be assessed, and explain why.
                </p>

                {RUBRIC_SECTIONS.map((section) => (
                  <section className="rubric-section" key={section}>
                    <div className="rubric-section-heading">
                      <p className="eyebrow">{section}</p>
                      <span>{section === "Turn-level assessment" ? "Judge Najah’s individual responses." : "Judge the episode as a whole."}</span>
                    </div>
                    {RUBRIC_DIMENSIONS.filter((dimension) => dimension.section === section).map((dimension) => (
                      <ScoreCard
                        key={dimension.key}
                        dimension={dimension}
                        score={draft.scores[dimension.key]}
                        evidenceTurns={draft.evidenceTurns[dimension.key]}
                        justification={draft.justifications[dimension.key]}
                        onScoreChange={(score) => updateScore(dimension.key, score)}
                        onEvidenceChange={(value) => updateDimensionText("evidenceTurns", dimension.key, value)}
                        onJustificationChange={(value) => updateDimensionText("justifications", dimension.key, value)}
                      />
                    ))}
                  </section>
                ))}

                <section className="rubric-section critical-section">
                  <div className="rubric-section-heading">
                    <p className="eyebrow">Critical-failure flags</p>
                    <span>Select Yes or No for every flag. A Yes requires exact turn evidence and an explanation.</span>
                  </div>
                  {CRITICAL_FLAGS.map((flag) => (
                    <CriticalFlagCard
                      key={flag.key}
                      flag={flag}
                      value={draft.criticalFlags[flag.key]}
                      evidence={draft.criticalEvidence[flag.key]}
                      onValueChange={(value) => updateCriticalFlag(flag.key, value)}
                      onEvidenceChange={(value) => updateCriticalEvidence(flag.key, value)}
                    />
                  ))}
                </section>

                <label className="form-field comments-field">
                  <span>Additional adjudication note <small>optional</small></span>
                  <textarea value={draft.comments} onChange={(event) => updateComments(event.target.value)} placeholder="Add context not already captured in the required evidence fields." rows={4} />
                </label>

                <div className="rating-actions">
                  <button className="secondary-button" onClick={() => void persist("draft")} disabled={saveState === "saving"}>Save draft</button>
                  <button className="primary-button" onClick={() => void submitAndAdvance()} disabled={saveState === "saving"}>Submit & next <span>→</span></button>
                </div>
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
