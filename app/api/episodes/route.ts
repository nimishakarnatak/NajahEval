import { ensureNajahSchema, getD1 } from "@/db";
import { resolveEpisodeLanguage } from "@/lib/language";
import {
  CRITICAL_FLAG_KEYS,
  DIMENSION_KEYS,
  CriticalFlagValue,
  DimensionScore,
  keyedRecord,
} from "@/lib/rubric";
import { getRaterIdentity } from "@/lib/server-auth";

const LOCAL_DEMO_EPISODES = [
  {
    id: "DEMO-AR-001",
    language: "ar",
    module: "interview_preparation",
    objective: "Help the participant practise interviews and improve readiness.",
    context: "[TURN 001] USER: أبحث عن أول وظيفة لي بعد التخرج.",
    transcript:
      "[TURN 001] USER: كيف أستعد لسؤال حدثيني عن نفسك؟\n[TURN 002] NAJAH: ابدئي بملخص موجز عن دراستك، ثم اذكري خبرة أو مشروعًا ذا صلة، واختمي بسبب اهتمامك بهذه الوظيفة.",
  },
  {
    id: "DEMO-FR-001",
    language: "fr",
    module: "cv_building",
    objective: "Help the participant create or improve usable CV content.",
    context: "",
    transcript:
      "[TURN 001] USER: Mon CV est trop général.\n[TURN 002] NAJAH: Commençons par adapter le résumé au poste visé. Quel métier recherchez-vous et quelles réalisations pouvez-vous quantifier ?",
  },
  {
    id: "DEMO-EN-001",
    language: "en",
    module: "job_search_strategy",
    objective: "Help the participant build a focused, actionable job-search plan.",
    context: "[TURN 001] USER: I recently finished an economics degree.",
    transcript:
      "[TURN 001] USER: I apply everywhere but rarely hear back.\n[TURN 002] NAJAH: Let’s narrow the search to two role families, identify ten suitable employers, and tailor your CV keywords before each application.",
  },
];

async function seedLocalPreview(db: D1Database, request: Request) {
  const hostname = new URL(request.url).hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") return;

  const count = await db.prepare("SELECT COUNT(*) AS count FROM episodes").first<{
    count: number;
  }>();
  if ((count?.count ?? 0) > 0) return;

  await db.batch(
    LOCAL_DEMO_EPISODES.map((episode) =>
      db
        .prepare(`
          INSERT OR IGNORE INTO episodes (
            episode_id, language, module, module_objective, prior_context,
            transcript, privacy_review_status, language_review_status,
            import_batch, imported_by
          ) VALUES (?, ?, ?, ?, ?, ?, 'approved', 'not_required', 'local-demo', 'system')
        `)
        .bind(
          episode.id,
          episode.language,
          episode.module,
          episode.objective,
          episode.context,
          episode.transcript,
        ),
    ),
  );
}

/**
 * Reads a JSON object stored in D1 while providing every expected key. A bad or
 * old value becomes a blank draft instead of breaking the annotator queue.
 */
function parseKeyedJson<T, K extends readonly string[]>(
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
  for (const key of keys) {
    if (Object.hasOwn(parsed, key)) result[key] = parsed[key] as T;
  }
  return result;
}

export async function GET(request: Request) {
  const rater = await getRaterIdentity(request);
  if (!rater) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }

  const db = getD1();
  await ensureNajahSchema(db);
  await seedLocalPreview(db, request);

  const result = await db
    .prepare(`
      SELECT
        e.episode_id AS episodeId,
        e.language,
        e.module,
        e.module_objective AS moduleObjective,
        e.prior_context AS priorContext,
        e.transcript,
        e.privacy_review_status AS privacyReviewStatus,
        e.language_review_status AS languageReviewStatus,
        (
          SELECT COUNT(*) FROM rubric_annotations completed
          WHERE completed.episode_id = e.episode_id
            AND completed.status = 'complete'
        ) AS completedRaterCount,
        current.scores_json AS scoresJson,
        current.evidence_turns_json AS evidenceTurnsJson,
        current.justifications_json AS justificationsJson,
        current.critical_flags_json AS criticalFlagsJson,
        current.critical_evidence_json AS criticalEvidenceJson,
        current.comments,
        current.rubric_version AS rubricVersion,
        current.status AS annotationStatus,
        current.updated_at AS annotationUpdatedAt
      FROM episodes e
      LEFT JOIN rubric_annotations current
        ON current.episode_id = e.episode_id
       AND current.rater_id = ?
      ORDER BY
        CASE e.language WHEN 'ar' THEN 1 WHEN 'fr' THEN 2 WHEN 'en' THEN 3 ELSE 4 END,
        e.module,
        e.episode_id
    `)
    .bind(rater.id)
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
