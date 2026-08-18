import { ensureNajahSchema, getD1 } from "@/db";
import { resolveEpisodeLanguage } from "@/lib/language";
import { getRaterIdentity } from "@/lib/server-auth";

type ImportEpisode = {
  episodeId?: string;
  language?: string;
  module?: string;
  moduleObjective?: string;
  priorContext?: string;
  transcript?: string;
  privacyReviewStatus?: string;
  languageReviewStatus?: string;
  releaseEligible?: boolean;
  codeSwitchingDetected?: boolean;
};

export async function POST(request: Request) {
  const rater = await getRaterIdentity(request);
  if (!rater) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }
  if (rater.role !== "admin") {
    return Response.json({ error: "Only the account administrator can import datasets." }, { status: 403 });
  }

  const payload = (await request.json()) as {
    batchName?: string;
    episodes?: ImportEpisode[];
  };
  const rows = payload.episodes ?? [];
  if (!rows.length || rows.length > 50) {
    return Response.json(
      { error: "Each import batch must contain between 1 and 50 episodes." },
      { status: 400 },
    );
  }

  const accepted: Required<ImportEpisode>[] = [];
  const rejected: { episodeId: string; reason: string }[] = [];
  for (const row of rows) {
    const episodeId = row.episodeId?.trim() ?? "";
    if (!episodeId || !row.transcript?.trim()) {
      rejected.push({ episodeId: episodeId || "unknown", reason: "missing required text" });
      continue;
    }
    accepted.push({
      episodeId,
      language: resolveEpisodeLanguage(
        row.language,
        row.transcript,
        row.codeSwitchingDetected,
      ),
      module: row.module?.trim() || "unknown",
      moduleObjective: row.moduleObjective?.trim() || "",
      priorContext: row.priorContext?.trim() || "",
      transcript: row.transcript.trim(),
      privacyReviewStatus: row.privacyReviewStatus || "not_reviewed",
      languageReviewStatus: row.languageReviewStatus || "not_required",
      releaseEligible: row.releaseEligible === true,
      codeSwitchingDetected: row.codeSwitchingDetected ?? false,
    });
  }

  if (accepted.length) {
    const db = getD1();
    await ensureNajahSchema(db);
    await db.batch(
      accepted.map((episode) =>
        db
          .prepare(`
            INSERT INTO episodes (
              episode_id, language, module, module_objective, prior_context,
              transcript, privacy_review_status, language_review_status,
              import_batch, imported_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(episode_id) DO UPDATE SET
              language = excluded.language,
              module = excluded.module,
              module_objective = excluded.module_objective,
              prior_context = excluded.prior_context,
              transcript = excluded.transcript,
              privacy_review_status = excluded.privacy_review_status,
              language_review_status = excluded.language_review_status,
              import_batch = excluded.import_batch,
              imported_by = excluded.imported_by,
              imported_at = CURRENT_TIMESTAMP
          `)
          .bind(
            episode.episodeId,
            episode.language,
            episode.module,
            episode.moduleObjective,
            episode.priorContext,
            episode.transcript,
            episode.privacyReviewStatus,
            episode.languageReviewStatus,
            payload.batchName?.trim() || "manual-import",
            rater.id,
          ),
      ),
    );
  }

  return Response.json({
    imported: accepted.length,
    rejected: rejected.length,
    rejectionDetails: rejected.slice(0, 20),
  });
}
