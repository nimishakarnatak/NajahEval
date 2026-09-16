import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AppDatabase, DatabaseValue } from "@/db";
import { priorContextOrExplanation } from "@/lib/prior-context";

const finalDatasetCsv = readFileSync(
  join(process.cwd(), "data", "najah_final_annotation_dataset.csv"),
  "utf8",
);

/** Version used by the currently published CSV, which predates the version column. */
const LEGACY_BUNDLED_DATASET_VERSION = "najah-activity-sample-v4-flexible-judge-review";

type BundledEpisode = {
  episodeId: string;
  studyOrder: number;
  judgeBaseAssignment: "" | "judge_1" | "judge_2";
  studentStatus: string;
  participantGender: string;
  activityGroup: string;
  samplingWeight: number | null;
  participantSamplingProbability: number | null;
  focalEpisodeSelectionProbability: number | null;
  combinedEpisodeInclusionProbability: number | null;
  activityGroupValidationStatus: string;
  language: string;
  module: string;
  treatment: string;
  moduleObjective: string;
  priorContext: string;
  transcript: string;
  privacyReviewStatus: string;
  languageReviewStatus: string;
};

type BundledDataset = {
  version: string;
  episodes: BundledEpisode[];
};

/**
 * Parses CSV containing quoted commas, quotes, and multiline transcripts.
 *
 * Najah conversations regularly contain every one of those characters, so a
 * line split is not safe. The parser intentionally mirrors the browser import
 * format but runs only on the server and never exposes the source CSV itself.
 */
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

/**
 * Converts the compact, reviewed CSV into the fields stored by the website.
 * Throws during startup if a future dataset is missing any required column.
 */
function optionalNumber(value: string | undefined): number | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Read one internally versioned dataset while retaining legacy compatibility. */
function readBundledDataset(csv: string): BundledDataset {
  const rows = parseCsv(csv);
  const headers = (rows.shift() ?? []).map((header) =>
    header.trim().replace(/^\ufeff/, ""),
  );
  const requiredHeaders = [
    "rater_item_order",
    "episode_id",
    "student_status",
    "language",
    "module",
    "treatment",
    "module_objective",
    "prior_context",
    "transcript",
    "privacy_review_status",
    "language_review_status",
  ];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length) {
    throw new Error(`The bundled Najah dataset is missing: ${missingHeaders.join(", ")}`);
  }

  const versionIndex = headers.indexOf("dataset_version");
  const declaredVersions = new Set(
    rows
      .filter((row) => row.some((value) => value.trim()))
      .map((row) => (versionIndex >= 0 ? (row[versionIndex] ?? "").trim() : ""))
      .filter(Boolean),
  );
  if (declaredVersions.size > 1) {
    throw new Error("The bundled Najah CSV contains more than one dataset version.");
  }
  const version = [...declaredVersions][0] ?? LEGACY_BUNDLED_DATASET_VERSION;

  const episodes = rows
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => {
      const record = Object.fromEntries(
        headers.map((header, index) => [header, row[index] ?? ""]),
      );
      return {
        episodeId: record.episode_id.trim(),
        studyOrder: Number(record.rater_item_order),
        judgeBaseAssignment: "" as const,
        studentStatus: record.student_status.trim() || "unknown",
        participantGender: record.participant_gender?.trim() || "unknown",
        activityGroup: record.activity_group?.trim() || "",
        samplingWeight: optionalNumber(record.sampling_weight),
        participantSamplingProbability: optionalNumber(
          record.participant_sampling_probability,
        ),
        focalEpisodeSelectionProbability: optionalNumber(
          record.focal_episode_selection_probability,
        ),
        combinedEpisodeInclusionProbability: optionalNumber(
          record.combined_episode_inclusion_probability,
        ),
        activityGroupValidationStatus:
          record.activity_group_validation_status?.trim() || "",
        language: record.language.trim() || "unknown",
        module: record.module.trim() || "unknown",
        treatment: record.treatment.trim() || "unknown",
        moduleObjective: record.module_objective.trim(),
        priorContext: priorContextOrExplanation(record.prior_context),
        transcript: record.transcript.trim(),
        privacyReviewStatus: record.privacy_review_status.trim() || "not_reviewed",
        languageReviewStatus: record.language_review_status.trim() || "not_required",
      } satisfies BundledEpisode;
    });

  const ids = new Set(episodes.map((episode) => episode.episodeId));
  if (episodes.length !== 300 || ids.size !== episodes.length) {
    throw new Error("The bundled Najah dataset must contain 300 unique episodes.");
  }
  if (
    episodes.some(
      (episode) =>
        !episode.episodeId || !episode.transcript || !episode.priorContext,
    )
  ) {
    throw new Error(
      "Every bundled Najah episode must have an ID, transcript, and prior-context statement.",
    );
  }
  const studyOrders = new Set(episodes.map((episode) => episode.studyOrder));
  if (
    studyOrders.size !== 300 ||
    episodes.some((episode) => !Number.isInteger(episode.studyOrder)) ||
    Math.min(...studyOrders) !== 1 ||
    Math.max(...studyOrders) !== 300
  ) {
    throw new Error("The bundled Najah dataset must have unique study orders from 1 to 300.");
  }

  validateBalancedActivityCohorts(episodes);
  assignJudgeBaseSamples(episodes);
  return { version, episodes };
}

/**
 * Guard the activity-stratified study design encoded by study order.
 *
 * Activity is deliberately retained as server-side analysis metadata rather
 * than returned by the rater episode API. When a versioned activity sample is
 * bundled, every primary-rater cohort must contain 100 episodes and 33 or 34
 * Low, Medium, and High episodes. This prevents a future CSV reorder from
 * confounding activity group with rater team.
 */
function validateBalancedActivityCohorts(episodes: BundledEpisode[]): void {
  const activityGroups = ["low", "medium", "high"] as const;
  if (!episodes.some((episode) => episode.activityGroup)) return;

  if (
    episodes.some(
      (episode) =>
        !activityGroups.includes(
          episode.activityGroup as (typeof activityGroups)[number],
        ),
    )
  ) {
    throw new Error(
      "Every episode in the activity-stratified dataset must have a recognized activity group.",
    );
  }

  for (const activityGroup of activityGroups) {
    const total = episodes.filter(
      (episode) => episode.activityGroup === activityGroup,
    ).length;
    if (total !== 100) {
      throw new Error(`The bundled dataset must contain 100 ${activityGroup} episodes.`);
    }
  }

  const cohorts = [
    { label: "Group A", start: 1, end: 100 },
    { label: "Group B", start: 101, end: 200 },
    { label: "Group C", start: 201, end: 300 },
  ];
  for (const cohort of cohorts) {
    const assigned = episodes.filter(
      (episode) =>
        episode.studyOrder >= cohort.start && episode.studyOrder <= cohort.end,
    );
    if (assigned.length !== 100) {
      throw new Error(`${cohort.label} must contain exactly 100 episodes.`);
    }
    for (const activityGroup of activityGroups) {
      const count = assigned.filter(
        (episode) => episode.activityGroup === activityGroup,
      ).length;
      if (count < 33 || count > 34) {
        throw new Error(
          `${cohort.label} must contain 33 or 34 ${activityGroup} episodes.`,
        );
      }
    }
  }
}

/** Stable non-cryptographic rank used only for reproducible random sampling. */
function seededJudgeRank(episodeId: string): number {
  const value = `najah-judge-base-v1:${episodeId}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Select two non-overlapping, reproducible 50-episode judge samples.
 *
 * The quotas balance the 100 sampled episodes across the three primary groups:
 * Judge 1 receives 17/17/16 and Judge 2 receives 16/17/17 from Groups A/B/C.
 * Within each group, episode IDs are ordered by a fixed seeded hash rather than
 * by study order, preventing the sample from changing between deployments.
 */
function assignJudgeBaseSamples(episodes: BundledEpisode[]): void {
  const quotas = [
    { start: 1, end: 100, judge1: 17, judge2: 16 },
    { start: 101, end: 200, judge1: 17, judge2: 17 },
    { start: 201, end: 300, judge1: 16, judge2: 17 },
  ];

  for (const quota of quotas) {
    const ranked = episodes
      .filter((episode) => episode.studyOrder >= quota.start && episode.studyOrder <= quota.end)
      .sort((left, right) =>
        seededJudgeRank(left.episodeId) - seededJudgeRank(right.episodeId) ||
        left.episodeId.localeCompare(right.episodeId),
      );
    for (const episode of ranked.slice(0, quota.judge1)) {
      episode.judgeBaseAssignment = "judge_1";
    }
    for (const episode of ranked.slice(quota.judge1, quota.judge1 + quota.judge2)) {
      episode.judgeBaseAssignment = "judge_2";
    }
  }

  const judge1Count = episodes.filter((episode) => episode.judgeBaseAssignment === "judge_1").length;
  const judge2Count = episodes.filter((episode) => episode.judgeBaseAssignment === "judge_2").length;
  if (judge1Count !== 50 || judge2Count !== 50) {
    throw new Error("Each judge base sample must contain exactly 50 episodes.");
  }
}

const BUNDLED_DATASET = readBundledDataset(finalDatasetCsv);

/** Stable marker read from the CSV so a reviewed replacement starts a new batch. */
export const BUNDLED_DATASET_VERSION = BUNDLED_DATASET.version;

const BUNDLED_EPISODES = BUNDLED_DATASET.episodes;

/** Number of reviewed episodes automatically available to every rater. */
export const BUNDLED_EPISODE_COUNT = BUNDLED_EPISODES.length;

/**
 * Ensures that the reviewed 300-episode sample is present in the shared
 * Postgres database before the queue is returned.
 *
 * All 300 rows are sent as one parameterized multi-row upsert. This avoids 300
 * network round trips from a serverless function while keeping transcript text
 * out of SQL syntax and protected by bound parameters.
 * database before the queue is returned.
 *
 * The operation is idempotent. Once all rows carry the current dataset marker,
 * later requests perform only a count query. A new sample uses a new marker:
 * overlapping episode IDs are updated in place, while earlier sample episodes
 * and their ratings remain stored as historical data. Active-site queries use
 * this marker so old and new samples can never be mixed in a rater queue.
 */
export async function ensureBundledDataset(db: AppDatabase): Promise<void> {
  const existing = await db
    .prepare("SELECT COUNT(*) AS count FROM episodes WHERE import_batch = ?")
    .bind(BUNDLED_DATASET_VERSION)
    .first<{ count: number | string }>();
  if (Number(existing?.count ?? 0) === BUNDLED_EPISODES.length) return;

  const values: DatabaseValue[] = [];
  const rows = BUNDLED_EPISODES.map((episode) => {
    const rowValues = [
      episode.episodeId,
      episode.studyOrder,
      episode.judgeBaseAssignment,
      episode.studentStatus,
      episode.participantGender,
      episode.activityGroup,
      episode.samplingWeight,
      episode.participantSamplingProbability,
      episode.focalEpisodeSelectionProbability,
      episode.combinedEpisodeInclusionProbability,
      episode.activityGroupValidationStatus,
      episode.language,
      episode.module,
      episode.treatment,
      episode.moduleObjective,
      episode.priorContext,
      episode.transcript,
      episode.privacyReviewStatus,
      episode.languageReviewStatus,
      BUNDLED_DATASET_VERSION,
    ];
    const start = values.length + 1;
    values.push(...rowValues);
    const placeholders = rowValues.map((_, offset) => `$${start + offset}`);
    return `(${placeholders.join(", ")}, 'system')`;
  });

  await db.execute(
    `
      INSERT INTO episodes (
        episode_id, study_order, judge_base_assignment, student_status,
        participant_gender, activity_group, sampling_weight,
        participant_sampling_probability, focal_episode_selection_probability,
        combined_episode_inclusion_probability, activity_group_validation_status,
        language, module, treatment,
        module_objective, prior_context, transcript,
        privacy_review_status, language_review_status,
        import_batch, imported_by
      ) VALUES ${rows.join(",\n")}
      ON CONFLICT(episode_id) DO UPDATE SET
        study_order = excluded.study_order,
        judge_base_assignment = excluded.judge_base_assignment,
        student_status = excluded.student_status,
        participant_gender = excluded.participant_gender,
        activity_group = excluded.activity_group,
        sampling_weight = excluded.sampling_weight,
        participant_sampling_probability = excluded.participant_sampling_probability,
        focal_episode_selection_probability = excluded.focal_episode_selection_probability,
        combined_episode_inclusion_probability = excluded.combined_episode_inclusion_probability,
        activity_group_validation_status = excluded.activity_group_validation_status,
        language = excluded.language,
        module = excluded.module,
        treatment = excluded.treatment,
        module_objective = excluded.module_objective,
        prior_context = excluded.prior_context,
        transcript = excluded.transcript,
        privacy_review_status = excluded.privacy_review_status,
        language_review_status = excluded.language_review_status,
        import_batch = excluded.import_batch,
        imported_by = excluded.imported_by,
        imported_at = CURRENT_TIMESTAMP
    `,
    values,
  );
}
