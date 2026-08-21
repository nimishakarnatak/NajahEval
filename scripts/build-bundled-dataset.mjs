import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * Parses RFC 4180-style CSV text without adding a runtime dependency.
 *
 * The Najah transcripts contain commas, quotes, line breaks, Arabic, and
 * French accents. Splitting on commas or lines would therefore corrupt the
 * conversations. This state-machine parser preserves quoted fields exactly.
 *
 * @param {string} text Complete CSV file contents.
 * @returns {string[][]} Parsed rows in their original order.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
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
 * Converts a CSV file into records keyed by its header row.
 * Blank trailing rows are discarded, while blank fields remain intact.
 *
 * @param {string} text Complete CSV file contents.
 * @returns {Record<string, string>[]} Row objects keyed by column name.
 */
function recordsFromCsv(text) {
  const rows = parseCsv(text);
  const headers = (rows.shift() ?? []).map((header) =>
    header.trim().replace(/^\ufeff/, ""),
  );
  return rows
    .filter((row) => row.some((value) => value.trim()))
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
    );
}

/**
 * Quotes one CSV field only when required by the CSV standard.
 *
 * @param {unknown} value Value to serialize.
 * @returns {string} Safe CSV field.
 */
function csvField(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Maps the study's historical group labels to the rater-facing student-status
 * dimension agreed for the website.
 *
 * @param {string} experimentalGroup Historical group label from the pipeline.
 * @returns {"current_student" | "graduated_student" | "unknown"}
 */
function studentStatus(experimentalGroup) {
  const normalized = experimentalGroup.trim().toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  // Gender-sensitive assignments can be appended to the group label, so the
  // group token may be part of a longer value such as "group1, gender-sensitive".
  if (normalized.includes("group1")) return "current_student";
  if (normalized.includes("group2")) return "graduated_student";
  return "unknown";
}

/**
 * Converts pipeline treatment labels into the two canonical website values.
 *
 * @param {string} value Treatment value from the sampling frame.
 * @returns {"standard" | "gender_sensitive" | "unknown"}
 */
function treatment(value) {
  const normalized = value.trim().toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  if (["gendersensitive", "gender", "treatment"].includes(normalized)) {
    return "gender_sensitive";
  }
  if (["notgendersensitive", "standard", "control"].includes(normalized)) {
    return "standard";
  }
  return "unknown";
}

/**
 * Builds the compact, site-ready CSV bundled with Najah Review Studio.
 *
 * The blinded file defines the 300 episodes and their presentation order. The
 * sampling file is joined only to restore treatment assignment and student
 * status, which were intentionally omitted from the blinded export. No names,
 * user identifiers, or unreviewed raw messages are copied into the output.
 */
async function main() {
  const [blindedPath, samplingPath, outputPath] = process.argv
    .slice(2)
    .map((path) => resolve(path));
  if (!blindedPath || !samplingPath || !outputPath) {
    throw new Error(
      "Usage: node scripts/build-bundled-dataset.mjs <blinded.csv> <sample.csv> <output.csv>",
    );
  }

  const [blindedText, samplingText] = await Promise.all([
    readFile(blindedPath, "utf8"),
    readFile(samplingPath, "utf8"),
  ]);
  const blindedRows = recordsFromCsv(blindedText);
  const samplingRows = recordsFromCsv(samplingText);
  const sampleByEpisode = new Map(samplingRows.map((row) => [row.episode_id, row]));

  const columns = [
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

  const seen = new Set();
  const outputRows = blindedRows.map((row) => {
    if (!row.episode_id || !row.reviewed_transcript) {
      throw new Error("The blinded dataset contains an episode without an ID or transcript.");
    }
    if (seen.has(row.episode_id)) {
      throw new Error(`Duplicate episode ID in blinded dataset: ${row.episode_id}`);
    }
    seen.add(row.episode_id);

    const sample = sampleByEpisode.get(row.episode_id);
    if (!sample) {
      throw new Error(`Episode ${row.episode_id} is missing from the sampling file.`);
    }

    return {
      rater_item_order: row.rater_item_order,
      episode_id: row.episode_id,
      student_status: studentStatus(sample.experimental_group ?? ""),
      language: row.language,
      module: row.module,
      treatment: treatment(sample.treatment ?? ""),
      module_objective: row.module_objective,
      prior_context: row.reviewed_prior_context,
      transcript: row.reviewed_transcript,
      privacy_review_status: row.privacy_review_status || "not_reviewed",
      language_review_status: row.language_review_status || "not_required",
    };
  });

  if (outputRows.length !== 300) {
    throw new Error(`Expected 300 blinded episodes, found ${outputRows.length}.`);
  }
  if (outputRows.some((row) => row.treatment === "unknown")) {
    const unmapped = blindedRows
      .map((row) => sampleByEpisode.get(row.episode_id))
      .filter((row) =>
        row && treatment(row.treatment ?? "") === "unknown",
      )
      .map((row) => ({
        episode_id: row.episode_id,
        experimental_group: row.experimental_group,
        treatment: row.treatment,
      }));
    throw new Error(`Unmapped dimensions: ${JSON.stringify(unmapped.slice(0, 10))}`);
  }

  const csv = [
    columns,
    ...outputRows.map((row) => columns.map((column) => row[column])),
  ]
    .map((row) => row.map(csvField).join(","))
    .join("\n");

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${csv}\n`, "utf8");
  const statusCounts = Object.groupBy(outputRows, (row) => row.student_status);
  process.stdout.write(
    `Bundled ${outputRows.length} episodes in ${outputPath} ` +
      `(${Object.entries(statusCounts).map(([key, rows]) => `${key}: ${rows.length}`).join(", ")})\n`,
  );
}

await main();
