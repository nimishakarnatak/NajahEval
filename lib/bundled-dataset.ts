import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AppDatabase, DatabaseValue } from "@/db";

const finalDatasetCsv = readFileSync(
  join(process.cwd(), "data", "najah_final_annotation_dataset.csv"),
  "utf8",
);

/** Stable marker used to detect whether this exact bundled sample is in Postgres. */
export const BUNDLED_DATASET_VERSION = "najah-activity-sample-v2";

type BundledEpisode = {
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
function readBundledEpisodes(csv: string): BundledEpisode[] {
  const rows = parseCsv(csv);
  const headers = (rows.shift() ?? []).map((header) =>
    header.trim().replace(/^\ufeff/, ""),
  );
  const requiredHeaders = [
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

  const episodes = rows
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => {
      const record = Object.fromEntries(
        headers.map((header, index) => [header, row[index] ?? ""]),
      );
      return {
        episodeId: record.episode_id.trim(),
        studentStatus: record.student_status.trim() || "unknown",
        language: record.language.trim() || "unknown",
        module: record.module.trim() || "unknown",
        treatment: record.treatment.trim() || "unknown",
        moduleObjective: record.module_objective.trim(),
        priorContext: record.prior_context.trim(),
        transcript: record.transcript.trim(),
        privacyReviewStatus: record.privacy_review_status.trim() || "not_reviewed",
        languageReviewStatus: record.language_review_status.trim() || "not_required",
      } satisfies BundledEpisode;
    });

  const ids = new Set(episodes.map((episode) => episode.episodeId));
  if (episodes.length !== 300 || ids.size !== episodes.length) {
    throw new Error("The bundled Najah dataset must contain 300 unique episodes.");
  }
  if (episodes.some((episode) => !episode.episodeId || !episode.transcript)) {
    throw new Error("Every bundled Najah episode must have an ID and transcript.");
  }
  return episodes;
}

const BUNDLED_EPISODES = readBundledEpisodes(finalDatasetCsv);

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
      episode.studentStatus,
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
        episode_id, student_status, language, module, treatment,
        module_objective, prior_context, transcript,
        privacy_review_status, language_review_status,
        import_batch, imported_by
      ) VALUES ${rows.join(",\n")}
      ON CONFLICT(episode_id) DO UPDATE SET
        student_status = excluded.student_status,
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
