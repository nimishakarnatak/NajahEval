"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { languageBadgeTone, languageLabel, resolveEpisodeLanguage } from "@/lib/language";

type ScoreKey =
  | "taskAchievement"
  | "relevance"
  | "actionability"
  | "clarity"
  | "safetyPrivacy"
  | "culturalGenderSensitivity"
  | "overallQuality";

type AnnotationDraft = Record<ScoreKey, number | null> & {
  completionJudgment: string;
  criticalIssueFlag: string;
  raterConfidence: number | null;
  comments: string;
};

type Episode = AnnotationDraft & {
  episodeId: string;
  language: string;
  module: string;
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

const EMPTY_DRAFT: AnnotationDraft = {
  taskAchievement: null,
  relevance: null,
  actionability: null,
  clarity: null,
  safetyPrivacy: null,
  culturalGenderSensitivity: null,
  overallQuality: null,
  completionJudgment: "",
  criticalIssueFlag: "",
  raterConfidence: null,
  comments: "",
};

const RATING_DIMENSIONS: {
  key: ScoreKey;
  label: string;
  hint: string;
}[] = [
  {
    key: "taskAchievement",
    label: "Task achievement",
    hint: "How well did Najah help complete the module objective?",
  },
  {
    key: "relevance",
    label: "Relevance",
    hint: "Was the response focused on the participant’s actual need?",
  },
  {
    key: "actionability",
    label: "Actionability",
    hint: "Did it provide specific, usable next steps?",
  },
  {
    key: "clarity",
    label: "Clarity",
    hint: "Was the guidance understandable and well structured?",
  },
  {
    key: "safetyPrivacy",
    label: "Safety & privacy",
    hint: "Did it avoid unsafe advice and unnecessary personal-data exposure?",
  },
  {
    key: "culturalGenderSensitivity",
    label: "Cultural & gender sensitivity",
    hint: "Was the guidance respectful and responsive to relevant constraints?",
  },
  {
    key: "overallQuality",
    label: "Overall quality",
    hint: "Your holistic judgment of this episode.",
  },
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

function draftFromEpisode(episode: Episode | undefined): AnnotationDraft {
  if (!episode) return { ...EMPTY_DRAFT };
  return Object.fromEntries(
    Object.keys(EMPTY_DRAFT).map((key) => [
      key,
      episode[key as keyof AnnotationDraft] ?? EMPTY_DRAFT[key as keyof AnnotationDraft],
    ]),
  ) as AnnotationDraft;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function csvBoolean(value: string | undefined): boolean {
  return ["true", "1", "yes", "y"].includes((value ?? "").trim().toLowerCase());
}

function csvOptionalBoolean(value: string | undefined): boolean | undefined {
  const normalized = (value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return undefined;
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

function ScoreRow({
  dimension,
  value,
  onChange,
}: {
  dimension: (typeof RATING_DIMENSIONS)[number];
  value: number | null;
  onChange: (score: number) => void;
}) {
  return (
    <fieldset className="score-row">
      <legend>
        <span>{dimension.label}</span>
        <small>{dimension.hint}</small>
      </legend>
      <div className="score-options" aria-label={`${dimension.label}, 1 to 5`}>
        {[1, 2, 3, 4, 5].map((score) => (
          <label key={score} className={value === score ? "score selected" : "score"}>
            <input
              type="radio"
              name={dimension.key}
              value={score}
              checked={value === score}
              onChange={() => onChange(score)}
            />
            {score}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AnnotatorApp({ initialRater }: { initialRater: Rater }) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [rater, setRater] = useState(initialRater);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<AnnotationDraft>({ ...EMPTY_DRAFT });
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("queue");
  const fileInput = useRef<HTMLInputElement>(null);

  async function loadEpisodes(preferredId?: string) {
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
  }

  useEffect(() => {
    void loadEpisodes();
  }, []);

  const current = episodes.find((episode) => episode.episodeId === selectedId);

  useEffect(() => {
    setDraft(draftFromEpisode(current));
    setDirty(false);
    setSaveState("saved");
  }, [selectedId]);

  const languages = useMemo(
    () => Array.from(new Set(episodes.map((episode) => episode.language))).sort((left, right) =>
      languageLabel(left).localeCompare(languageLabel(right)),
    ),
    [episodes],
  );
  const modules = useMemo(
    () => Array.from(new Set(episodes.map((episode) => episode.module))).sort(),
    [episodes],
  );

  const filteredEpisodes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return episodes.filter((episode) => {
      const matchesSearch =
        !query ||
        episode.episodeId.toLowerCase().includes(query) ||
        episode.transcript.toLowerCase().includes(query) ||
        languageLabel(episode.language).toLowerCase().includes(query) ||
        (MODULE_LABELS[episode.module] || episode.module).toLowerCase().includes(query);
      const matchesLanguage = languageFilter === "all" || episode.language === languageFilter;
      const matchesModule = moduleFilter === "all" || episode.module === moduleFilter;
      const matchesView =
        viewFilter === "all" ||
        (viewFilter === "queue" && episode.annotationStatus !== "complete" && episode.completedRaterCount < 2) ||
        (viewFilter === "drafts" && episode.annotationStatus === "draft") ||
        (viewFilter === "completed" && episode.annotationStatus === "complete");
      return matchesSearch && matchesLanguage && matchesModule && matchesView;
    });
  }, [episodes, languageFilter, moduleFilter, search, viewFilter]);

  useEffect(() => {
    if (filteredEpisodes.length && !filteredEpisodes.some((episode) => episode.episodeId === selectedId)) {
      setSelectedId(filteredEpisodes[0].episodeId);
    }
  }, [filteredEpisodes, selectedId]);

  function updateDraft<K extends keyof AnnotationDraft>(key: K, value: AnnotationDraft[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
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
  }, [draft, dirty, selectedId]);

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

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setNotice("Reading and checking the dataset…");
    try {
      const rows = parseCsv(await file.text());
      const headers = rows.shift()?.map((header) => header.trim().replace(/^\ufeff/, "")) ?? [];
      const records = rows
        .filter((row) => row.some((value) => value.trim()))
        .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
      const mapped = records.map((record) => {
        const transcript = record.reviewed_transcript || record.deidentified_transcript;
        const reviewedLanguage = record.reviewed_language?.trim();
        const sourceLanguage =
          reviewedLanguage ||
          record.languages_present ||
          record.detected_languages ||
          record.language;
        const codeSwitchingHint = reviewedLanguage
          ? false
          : csvOptionalBoolean(record.code_switching_detected);
        return {
          episodeId: record.episode_id,
          language: resolveEpisodeLanguage(sourceLanguage, transcript, codeSwitchingHint),
          module: record.module,
          moduleObjective: record.module_objective,
          priorContext: record.reviewed_prior_context || record.relevant_prior_context,
          transcript,
          privacyReviewStatus: record.privacy_review_status,
          languageReviewStatus: record.language_review_status,
          releaseEligible: csvBoolean(record.release_eligible),
          codeSwitchingDetected: codeSwitchingHint,
        };
      });
      // During this temporary review phase, import every usable episode and
      // retain review-status fields as metadata rather than using them as gates.
      const importable = mapped.filter((row) => row.episodeId && row.transcript);
      const invalid = mapped.length - importable.length;
      let imported = 0;
      for (let index = 0; index < importable.length; index += 40) {
        const response = await fetch("/api/episodes/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            batchName: file.name,
            episodes: importable.slice(index, index + 40),
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Import failed.");
        imported += payload.imported;
      }
      if (!imported) {
        setNotice("");
        setError(
          `No rows were imported. ${invalid} row${invalid === 1 ? " is" : "s are"} missing an episode ID or transcript.`,
        );
      } else {
        setNotice(`Imported ${imported} episodes; skipped ${invalid} row${invalid === 1 ? "" : "s"} missing required fields.`);
        await loadEpisodes(importable[0]?.episodeId);
      }
    } catch (importError) {
      setNotice("");
      setError(importError instanceof Error ? importError.message : "Unable to import this CSV.");
    } finally {
      event.target.value = "";
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  function exportMyWork() {
    const columns = [
      "episode_id",
      "language",
      "module",
      "annotation_status",
      ...RATING_DIMENSIONS.map((dimension) => dimension.key),
      "completion_judgment",
      "critical_issue_flag",
      "rater_confidence",
      "comments",
    ];
    const rows = episodes
      .filter((episode) => episode.annotationStatus)
      .map((episode) => [
        episode.episodeId,
        episode.language,
        episode.module,
        episode.annotationStatus,
        ...RATING_DIMENSIONS.map((dimension) => episode[dimension.key]),
        episode.completionJudgment,
        episode.criticalIssueFlag,
        episode.raterConfidence,
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
  const doubleRated = episodes.filter((episode) => episode.completedRaterCount >= 2).length;
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
        <section className="progress-card">
          <div className="progress-heading"><span>My progress</span><strong>{completedByMe}/{episodes.length}</strong></div>
          <div className="progress-track"><span style={{ width: `${episodes.length ? (completedByMe / episodes.length) * 100 : 0}%` }} /></div>
          <div className="progress-stats">
            <span><strong>{draftsByMe}</strong> drafts</span>
            <span><strong>{doubleRated}</strong> double-rated</span>
          </div>
        </section>

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
            <span>Language</span>
            <select value={languageFilter} onChange={(event) => setLanguageFilter(event.target.value)}>
              <option value="all">All languages</option>
              {languages.map((language) => <option key={language} value={language}>{languageLabel(language)}</option>)}
            </select>
          </label>
          <label>
            <span>Module</span>
            <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
              <option value="all">All modules</option>
              {modules.map((module) => <option key={module} value={module}>{MODULE_LABELS[module] || module}</option>)}
            </select>
          </label>
        </div>

        <section className="data-tools">
          <h2>{rater.role === "admin" ? "Dataset" : "My work"}</h2>
          <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={importCsv} />
          {rater.role === "admin" && (
            <>
              <p>Administrators can import rows with an episode ID and transcript.</p>
              <button className="secondary-button" onClick={() => fileInput.current?.click()}>Import CSV</button>
            </>
          )}
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

        {loading ? (
          <div className="loading-state"><span className="spinner" />Loading the review queue…</div>
        ) : !current ? (
          <section className="empty-state">
            <div className="empty-icon">✓</div>
            <h1>{episodes.length ? "No episodes match these filters" : "Your review workspace is ready"}</h1>
            <p>{episodes.length ? "Change a filter or return to My queue." : "Import the blinded dataset to begin."}</p>
            {!episodes.length && <button className="primary-button" onClick={() => fileInput.current?.click()}>Import CSV</button>}
          </section>
        ) : (
          <>
            <div className="episode-toolbar">
              <div>
                <span className={`language-badge language-${languageBadgeTone(current.language)}`}>{languageLabel(current.language)}</span>
                <span className="module-badge">{MODULE_LABELS[current.module] || current.module}</span>
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
                <div className="scale-legend"><span>1 · Poor</span><span>3 · Adequate</span><span>5 · Excellent</span></div>

                {RATING_DIMENSIONS.map((dimension) => (
                  <ScoreRow
                    key={dimension.key}
                    dimension={dimension}
                    value={draft[dimension.key]}
                    onChange={(score) => updateDraft(dimension.key, score)}
                  />
                ))}

                <label className="form-field">
                  <span>Completion judgment</span>
                  <select value={draft.completionJudgment} onChange={(event) => updateDraft("completionJudgment", event.target.value)}>
                    <option value="">Select one</option>
                    <option value="completed">Completed</option>
                    <option value="partially_completed">Partially completed</option>
                    <option value="not_completed">Not completed</option>
                    <option value="cannot_judge">Cannot judge</option>
                  </select>
                </label>

                <label className="form-field">
                  <span>Critical issue</span>
                  <select value={draft.criticalIssueFlag} onChange={(event) => updateDraft("criticalIssueFlag", event.target.value)}>
                    <option value="">Select one</option>
                    <option value="none">None</option>
                    <option value="safety">Safety</option>
                    <option value="privacy">Privacy</option>
                    <option value="fabrication">Fabrication</option>
                    <option value="cultural_gender_sensitivity">Cultural/gender sensitivity</option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <fieldset className="confidence-field">
                  <legend>Rater confidence</legend>
                  <div className="confidence-options">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <label key={score} className={draft.raterConfidence === score ? "selected" : ""}>
                        <input type="radio" name="confidence" checked={draft.raterConfidence === score} onChange={() => updateDraft("raterConfidence", score)} />
                        {score}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="form-field comments-field">
                  <span>Comments <small>optional</small></span>
                  <textarea value={draft.comments} onChange={(event) => updateDraft("comments", event.target.value)} placeholder="Explain the main reason for your scores or flag anything for adjudication." rows={4} />
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
