import { ensureNajahSchema, getD1 } from "@/db";
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
          SELECT COUNT(*) FROM annotations completed
          WHERE completed.episode_id = e.episode_id
            AND completed.status = 'complete'
        ) AS completedRaterCount,
        current.task_achievement AS taskAchievement,
        current.relevance,
        current.actionability,
        current.clarity,
        current.safety_privacy AS safetyPrivacy,
        current.cultural_gender_sensitivity AS culturalGenderSensitivity,
        current.overall_quality AS overallQuality,
        current.completion_judgment AS completionJudgment,
        current.critical_issue_flag AS criticalIssueFlag,
        current.rater_confidence AS raterConfidence,
        current.comments,
        current.status AS annotationStatus,
        current.updated_at AS annotationUpdatedAt
      FROM episodes e
      LEFT JOIN annotations current
        ON current.episode_id = e.episode_id
       AND current.rater_id = ?
      ORDER BY
        CASE e.language WHEN 'ar' THEN 1 WHEN 'fr' THEN 2 WHEN 'en' THEN 3 ELSE 4 END,
        e.module,
        e.episode_id
    `)
    .bind(rater.id)
    .all();

  return Response.json({
    rater,
    episodes: result.results,
  });
}
