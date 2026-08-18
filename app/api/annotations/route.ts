import { ensureNajahSchema, getD1 } from "@/db";
import { getRaterIdentity } from "@/lib/server-auth";

type AnnotationPayload = {
  episodeId?: string;
  taskAchievement?: number | null;
  relevance?: number | null;
  actionability?: number | null;
  clarity?: number | null;
  safetyPrivacy?: number | null;
  culturalGenderSensitivity?: number | null;
  overallQuality?: number | null;
  completionJudgment?: string;
  criticalIssueFlag?: string;
  raterConfidence?: number | null;
  comments?: string;
  status?: "draft" | "complete";
};

const SCORE_FIELDS: (keyof AnnotationPayload)[] = [
  "taskAchievement",
  "relevance",
  "actionability",
  "clarity",
  "safetyPrivacy",
  "culturalGenderSensitivity",
  "overallQuality",
  "raterConfidence",
];

function validScore(value: unknown): boolean {
  return value === null || value === undefined || (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5);
}

export async function POST(request: Request) {
  const rater = await getRaterIdentity(request);
  if (!rater) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }

  const payload = (await request.json()) as AnnotationPayload;
  const episodeId = payload.episodeId?.trim() ?? "";
  const status = payload.status === "complete" ? "complete" : "draft";
  if (!episodeId || SCORE_FIELDS.some((field) => !validScore(payload[field]))) {
    return Response.json({ error: "The annotation contains invalid values." }, { status: 400 });
  }

  if (status === "complete") {
    const missingScore = SCORE_FIELDS.some((field) => !validScore(payload[field]) || payload[field] == null);
    if (missingScore || !payload.completionJudgment || !payload.criticalIssueFlag) {
      return Response.json(
        { error: "Complete every rating, completion judgment, critical-issue field, and confidence score." },
        { status: 400 },
      );
    }
  }

  const db = getD1();
  await ensureNajahSchema(db);
  const episode = await db
    .prepare("SELECT episode_id FROM episodes WHERE episode_id = ?")
    .bind(episodeId)
    .first();
  if (!episode) {
    return Response.json({ error: "Episode not found." }, { status: 404 });
  }

  if (status === "complete") {
    const completed = await db
      .prepare(`
        SELECT COUNT(*) AS count FROM annotations
        WHERE episode_id = ? AND status = 'complete' AND rater_id != ?
      `)
      .bind(episodeId, rater.id)
      .first<{ count: number }>();
    if ((completed?.count ?? 0) >= 2) {
      return Response.json(
        { error: "This episode already has two independent completed ratings." },
        { status: 409 },
      );
    }
  }

  await db
    .prepare(`
      INSERT INTO annotations (
        episode_id, rater_id, rater_email, task_achievement, relevance,
        actionability, clarity, safety_privacy, cultural_gender_sensitivity,
        overall_quality, completion_judgment, critical_issue_flag,
        rater_confidence, comments, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(episode_id, rater_id) DO UPDATE SET
        rater_email = excluded.rater_email,
        task_achievement = excluded.task_achievement,
        relevance = excluded.relevance,
        actionability = excluded.actionability,
        clarity = excluded.clarity,
        safety_privacy = excluded.safety_privacy,
        cultural_gender_sensitivity = excluded.cultural_gender_sensitivity,
        overall_quality = excluded.overall_quality,
        completion_judgment = excluded.completion_judgment,
        critical_issue_flag = excluded.critical_issue_flag,
        rater_confidence = excluded.rater_confidence,
        comments = excluded.comments,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(
      episodeId,
      rater.id,
      rater.email,
      payload.taskAchievement ?? null,
      payload.relevance ?? null,
      payload.actionability ?? null,
      payload.clarity ?? null,
      payload.safetyPrivacy ?? null,
      payload.culturalGenderSensitivity ?? null,
      payload.overallQuality ?? null,
      payload.completionJudgment?.trim() || "",
      payload.criticalIssueFlag?.trim() || "",
      payload.raterConfidence ?? null,
      payload.comments?.trim() || "",
      status,
    )
    .run();

  return Response.json({ ok: true, status });
}
