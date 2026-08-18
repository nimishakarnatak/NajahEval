import { ensureNajahSchema, getD1 } from "@/db";
import {
  CRITICAL_FLAGS,
  CRITICAL_FLAG_KEYS,
  CriticalFlagKey,
  CriticalFlagValue,
  DIMENSION_KEYS,
  DimensionKey,
  DimensionScore,
  RUBRIC_DIMENSIONS,
  RUBRIC_VERSION,
  keyedRecord,
} from "@/lib/rubric";
import { getRaterIdentity } from "@/lib/server-auth";

type AnnotationPayload = {
  episodeId?: string;
  scores?: Partial<Record<DimensionKey, DimensionScore>>;
  evidenceTurns?: Partial<Record<DimensionKey, string>>;
  justifications?: Partial<Record<DimensionKey, string>>;
  criticalFlags?: Partial<Record<CriticalFlagKey, CriticalFlagValue>>;
  criticalEvidence?: Partial<Record<CriticalFlagKey, string>>;
  comments?: string;
  status?: "draft" | "complete";
};

type NormalizedAnnotation = {
  scores: Record<DimensionKey, DimensionScore>;
  evidenceTurns: Record<DimensionKey, string>;
  justifications: Record<DimensionKey, string>;
  criticalFlags: Record<CriticalFlagKey, CriticalFlagValue>;
  criticalEvidence: Record<CriticalFlagKey, string>;
  comments: string;
};

/** Returns true only for plain JSON objects suitable for keyed rubric data. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A rubric score is blank, one of the anchored integers, or explicit N/A. */
function validDimensionScore(value: unknown): value is DimensionScore {
  return value === null || value === 1 || value === 2 || value === 3 || value === "na";
}

/** A critical flag is blank while drafting, then an explicit Yes or No. */
function validCriticalFlag(value: unknown): value is CriticalFlagValue {
  return value === null || value === "yes" || value === "no";
}

/**
 * Normalizes a browser payload into complete keyed objects before validation or
 * storage. Trimming here keeps the database and CSV exports analysis-ready.
 */
function normalizePayload(payload: AnnotationPayload): NormalizedAnnotation | null {
  if (
    (payload.scores !== undefined && !isRecord(payload.scores)) ||
    (payload.evidenceTurns !== undefined && !isRecord(payload.evidenceTurns)) ||
    (payload.justifications !== undefined && !isRecord(payload.justifications)) ||
    (payload.criticalFlags !== undefined && !isRecord(payload.criticalFlags)) ||
    (payload.criticalEvidence !== undefined && !isRecord(payload.criticalEvidence)) ||
    (payload.comments !== undefined && typeof payload.comments !== "string")
  ) {
    return null;
  }

  const scoreSource = (payload.scores ?? {}) as Record<string, unknown>;
  const evidenceSource = (payload.evidenceTurns ?? {}) as Record<string, unknown>;
  const justificationSource = (payload.justifications ?? {}) as Record<string, unknown>;
  const flagSource = (payload.criticalFlags ?? {}) as Record<string, unknown>;
  const criticalEvidenceSource = (payload.criticalEvidence ?? {}) as Record<string, unknown>;

  const scores = keyedRecord(DIMENSION_KEYS, () => null as DimensionScore);
  const evidenceTurns = keyedRecord(DIMENSION_KEYS, () => "");
  const justifications = keyedRecord(DIMENSION_KEYS, () => "");
  for (const key of DIMENSION_KEYS) {
    const score = scoreSource[key] ?? null;
    const evidence = evidenceSource[key] ?? "";
    const justification = justificationSource[key] ?? "";
    if (!validDimensionScore(score) || typeof evidence !== "string" || typeof justification !== "string") {
      return null;
    }
    scores[key] = score;
    evidenceTurns[key] = evidence.trim();
    justifications[key] = justification.trim();
  }

  const criticalFlags = keyedRecord(CRITICAL_FLAG_KEYS, () => null as CriticalFlagValue);
  const criticalEvidence = keyedRecord(CRITICAL_FLAG_KEYS, () => "");
  for (const key of CRITICAL_FLAG_KEYS) {
    const flag = flagSource[key] ?? null;
    const evidence = criticalEvidenceSource[key] ?? "";
    if (!validCriticalFlag(flag) || typeof evidence !== "string") return null;
    criticalFlags[key] = flag;
    criticalEvidence[key] = evidence.trim();
  }

  return {
    scores,
    evidenceTurns,
    justifications,
    criticalFlags,
    criticalEvidence,
    comments: payload.comments?.trim() ?? "",
  };
}

/**
 * Applies the submission-only requirements. Drafts may be incomplete, while a
 * completed rating must be independently reproducible from cited evidence.
 */
function completionError(annotation: NormalizedAnnotation): string | null {
  for (const dimension of RUBRIC_DIMENSIONS) {
    const score = annotation.scores[dimension.key];
    if (score === null) return `Select a score or N/A for ${dimension.label}.`;
    if (score !== "na" && !annotation.evidenceTurns[dimension.key]) {
      return `Add the relevant turn number(s) for ${dimension.label}.`;
    }
    if ((score === 1 || score === 2) && !annotation.justifications[dimension.key]) {
      return `Explain why ${dimension.label} received a score of ${score}.`;
    }
    if (score === "na" && !annotation.justifications[dimension.key]) {
      return `Explain why ${dimension.label} genuinely cannot be assessed.`;
    }
  }

  for (const flag of CRITICAL_FLAGS) {
    const value = annotation.criticalFlags[flag.key];
    if (value === null) return `Select Yes or No for the ${flag.label} flag.`;
    if (value === "yes" && !annotation.criticalEvidence[flag.key]) {
      return `Provide turn evidence and an explanation for the ${flag.label} flag.`;
    }
  }
  return null;
}

export async function POST(request: Request) {
  const rater = await getRaterIdentity(request);
  if (!rater) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }

  const payload = (await request.json()) as AnnotationPayload;
  const episodeId = payload.episodeId?.trim() ?? "";
  const status = payload.status === "complete" ? "complete" : "draft";
  const annotation = normalizePayload(payload);
  if (!episodeId || !annotation) {
    return Response.json({ error: "The annotation contains invalid values." }, { status: 400 });
  }

  if (status === "complete") {
    const error = completionError(annotation);
    if (error) return Response.json({ error }, { status: 400 });
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
        SELECT COUNT(*) AS count FROM rubric_annotations
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
      INSERT INTO rubric_annotations (
        episode_id, rater_id, rater_email, scores_json, evidence_turns_json,
        justifications_json, critical_flags_json, critical_evidence_json,
        comments, rubric_version, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(episode_id, rater_id) DO UPDATE SET
        rater_email = excluded.rater_email,
        scores_json = excluded.scores_json,
        evidence_turns_json = excluded.evidence_turns_json,
        justifications_json = excluded.justifications_json,
        critical_flags_json = excluded.critical_flags_json,
        critical_evidence_json = excluded.critical_evidence_json,
        comments = excluded.comments,
        rubric_version = excluded.rubric_version,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(
      episodeId,
      rater.id,
      rater.email,
      JSON.stringify(annotation.scores),
      JSON.stringify(annotation.evidenceTurns),
      JSON.stringify(annotation.justifications),
      JSON.stringify(annotation.criticalFlags),
      JSON.stringify(annotation.criticalEvidence),
      annotation.comments,
      RUBRIC_VERSION,
      status,
    )
    .run();

  return Response.json({ ok: true, status, rubricVersion: RUBRIC_VERSION });
}
