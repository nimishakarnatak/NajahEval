import { ensureNajahSchema, getDatabase } from "@/db";
import {
  BUNDLED_DATASET_VERSION,
  ensureBundledDataset,
} from "@/lib/bundled-dataset";
import { normalizeStudentStatus, normalizeTreatment } from "@/lib/episode-dimensions";
import { resolveEpisodeLanguage } from "@/lib/language";
import {
  CRITICAL_FLAG_KEYS,
  DIMENSION_KEYS,
  CriticalFlagValue,
  DimensionScore,
  keyedRecord,
} from "@/lib/rubric";
import { getRaterIdentity } from "@/lib/server-auth";

/**
 * Reads a JSON object stored in Postgres while providing every expected key. A bad or
 * old value becomes a blank draft instead of breaking the annotator queue.
 */
function parseKeyedJson<T, K extends readonly string[] = readonly string[]>(
  value: unknown,
  keys: K,
  defaultValue: () => T,
): Record<K[number], T> {
  let parsed: Record<string, unknown> = {};
  if (typeof value === "string" && value) {
    try {
      const candidate = JSON.parse(value) as unknown;
      if (typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)) {
        parsed = candidate as Record<string, unknown>;
      }
    } catch {
      // The keyed defaults below intentionally recover malformed legacy data.
    }
  }
  const result = keyedRecord(keys, defaultValue);
  for (const key of keys as readonly K[number][]) {
    if (Object.hasOwn(parsed, key)) result[key] = parsed[key] as T;
  }
  return result;
}

export async function GET(request: Request) {
  const rater = await getRaterIdentity(request);
  if (!rater) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }

  const db = getDatabase();
  await ensureNajahSchema(db);
  await ensureBundledDataset(db);

  const result = await db
    .prepare(`
      SELECT
        e.episode_id AS "episodeId",
        e.student_status AS "studentStatus",
        e.language,
        e.module,
        e.treatment,
        e.module_objective AS "moduleObjective",
        e.prior_context AS "priorContext",
        e.transcript,
        e.privacy_review_status AS "privacyReviewStatus",
        e.language_review_status AS "languageReviewStatus",
        (
          SELECT COUNT(*) FROM rubric_annotations completed
          WHERE completed.episode_id = e.episode_id
            AND completed.status = 'complete'
        ) AS "completedRaterCount",
        current.scores_json AS "scoresJson",
        current.evidence_turns_json AS "evidenceTurnsJson",
        current.justifications_json AS "justificationsJson",
        current.critical_flags_json AS "criticalFlagsJson",
        current.critical_evidence_json AS "criticalEvidenceJson",
        current.task_status AS "taskStatus",
        current.task_incomplete_reason AS "taskIncompleteReason",
        current.episode_end_reason AS "legacyEpisodeEndReason",
        current.comments,
        current.rubric_version AS "rubricVersion",
        current.status AS "annotationStatus",
        current.updated_at AS "annotationUpdatedAt"
      FROM episodes e
      LEFT JOIN rubric_annotations current
        ON current.episode_id = e.episode_id
       AND current.rater_id = ?
      WHERE e.import_batch = ?
      ORDER BY
        CASE e.student_status
          WHEN 'graduated_student' THEN 1
          WHEN 'current_student' THEN 2
          ELSE 3
        END,
        e.module,
        CASE e.treatment WHEN 'standard' THEN 1 WHEN 'gender_sensitive' THEN 2 ELSE 3 END,
        e.episode_id
    `)
    .bind(rater.id, BUNDLED_DATASET_VERSION)
    .all();

  // Older imports stored only the primary language. Resolve the display value
  // when episodes are read so already-imported code-switched conversations are
  // upgraded without requiring annotators to upload the dataset again.
  const episodes = result.results.map((row) => {
    const episode = row as Record<string, unknown>;
    return {
      ...episode,
      scores: parseKeyedJson<DimensionScore>(episode.scoresJson, DIMENSION_KEYS, () => null),
      evidenceTurns: parseKeyedJson<string>(episode.evidenceTurnsJson, DIMENSION_KEYS, () => ""),
      justifications: parseKeyedJson<string>(episode.justificationsJson, DIMENSION_KEYS, () => ""),
      criticalFlags: parseKeyedJson<CriticalFlagValue>(episode.criticalFlagsJson, CRITICAL_FLAG_KEYS, () => null),
      criticalEvidence: parseKeyedJson<string>(episode.criticalEvidenceJson, CRITICAL_FLAG_KEYS, () => ""),
      taskStatus: typeof episode.taskStatus === "string" ? episode.taskStatus : "",
      taskIncompleteReason:
        typeof episode.taskIncompleteReason === "string" ? episode.taskIncompleteReason : "",
      legacyEpisodeEndReason:
        typeof episode.legacyEpisodeEndReason === "string" ? episode.legacyEpisodeEndReason : "",
      studentStatus: normalizeStudentStatus(episode.studentStatus),
      treatment: normalizeTreatment(episode.treatment),
      language: resolveEpisodeLanguage(
        typeof episode.language === "string" ? episode.language : undefined,
        typeof episode.transcript === "string" ? episode.transcript : "",
      ),
    };
  });

  return Response.json({
    rater,
    episodes,
  });
}
