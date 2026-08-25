import { ensureNajahSchema, getDatabase } from "@/db";
import {
  annotationExportCsv,
  exportFilenamePart,
  type ExportAnnotationRow,
} from "@/lib/annotation-export";
import { getRaterIdentity } from "@/lib/server-auth";

type ExportRater = {
  userId: string;
  displayName: string;
  email: string;
};

/** Download one rater's saved work or the administrator's combined dataset. */
export async function GET(request: Request) {
  const admin = await getRaterIdentity(request);
  if (!admin) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }
  if (admin.role !== "admin") {
    return Response.json({ error: "Administrator access is required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const combined = url.searchParams.get("scope") === "combined";
  const raterId = url.searchParams.get("raterId")?.trim() ?? "";
  if (!combined && !raterId) {
    return Response.json({ error: "Choose a rater or the combined export." }, { status: 400 });
  }

  const db = getDatabase();
  await ensureNajahSchema(db);

  let selectedRater: ExportRater | null = null;
  if (!combined) {
    selectedRater = await db
      .prepare(`
        SELECT
          user_id AS "userId",
          display_name AS "displayName",
          email
        FROM users
        WHERE user_id = ? AND role = 'rater'
      `)
      .bind(raterId)
      .first<ExportRater>();
    if (!selectedRater) {
      return Response.json({ error: "Rater not found." }, { status: 404 });
    }
  }

  const whereClause = combined
    ? "WHERE annotation_user.role <> 'admin'"
    : "WHERE ra.rater_id = ?";
  const query = db.prepare(`
    SELECT
      ra.rater_id AS "raterId",
      annotation_user.display_name AS "raterName",
      ra.rater_email AS "raterEmail",
      ra.episode_id AS "episodeId",
      e.student_status AS "studentStatus",
      e.module,
      e.treatment,
      e.language,
      ra.status,
      ra.episode_end_reason AS "episodeEndReason",
      ra.scores_json AS "scoresJson",
      ra.evidence_turns_json AS "evidenceTurnsJson",
      ra.justifications_json AS "justificationsJson",
      ra.critical_flags_json AS "criticalFlagsJson",
      ra.critical_evidence_json AS "criticalEvidenceJson",
      ra.comments,
      ra.rubric_version AS "rubricVersion",
      ra.updated_at AS "updatedAt"
    FROM rubric_annotations ra
    INNER JOIN episodes e ON e.episode_id = ra.episode_id
    INNER JOIN users annotation_user ON annotation_user.user_id = ra.rater_id
    ${whereClause}
    ORDER BY LOWER(annotation_user.display_name), ra.episode_id
  `);
  const result = combined
    ? await query.all<ExportAnnotationRow>()
    : await query.bind(raterId).all<ExportAnnotationRow>();

  const date = new Date().toISOString().slice(0, 10);
  const filename = combined
    ? `najah-all-raters-combined-${date}.csv`
    : `najah-${exportFilenamePart(selectedRater!.displayName)}-${date}.csv`;

  // The UTF-8 byte-order mark keeps Arabic and French text legible when a CSV
  // is opened directly in desktop Excel.
  return new Response(`\uFEFF${annotationExportCsv(result.results)}`, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-type": "text/csv; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}
