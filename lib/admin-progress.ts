import { ensureNajahSchema, getDatabase } from "@/db";
import { ensureBundledDataset } from "@/lib/bundled-dataset";

export type EvaluatorProgress = {
  raterId: string;
  displayName: string;
  email: string;
  joinedAt: string | null;
  completedCount: number;
  draftCount: number;
  notStartedCount: number;
  completionPercentage: number;
  lastActivity: string | null;
};

export type AdminProgress = {
  totalEpisodes: number;
  totalEvaluators: number;
  activeEvaluators: number;
  completedRatings: number;
  draftRatings: number;
  expectedRatings: number;
  coverage: {
    noCompletedRating: number;
    oneCompletedRating: number;
    twoOrMoreCompletedRatings: number;
  };
  evaluators: EvaluatorProgress[];
};

type CountRow = { count: number | string };

type RawEvaluatorProgress = {
  raterId: string;
  displayName: string;
  email: string;
  joinedAt: string | Date | null;
  completedCount: number | string;
  draftCount: number | string;
  lastActivity: string | Date | null;
};

type RawCoverage = {
  noCompletedRating: number | string;
  oneCompletedRating: number | string;
  twoOrMoreCompletedRatings: number | string;
};

/**
 * Converts a Postgres timestamp into a stable JSON-safe value. Neon normally
 * returns timestamp strings, while test or alternative drivers may return a
 * Date object. Invalid legacy values are treated as unavailable.
 */
function timestampToIso(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Builds the administrator's evaluator-progress view from saved annotations.
 *
 * Each registered rater is included even when they have not opened an episode.
 * A completed annotation counts as completed, a saved incomplete annotation
 * counts as a draft, and every remaining episode is "not started" for that
 * evaluator. Administrator accounts are intentionally excluded because this
 * dashboard is for monitoring the independent evaluation team.
 *
 * The bundled dataset is seeded first so a newly deployed site reports the
 * correct denominator before any evaluator has visited the review workspace.
 */
export async function getAdminProgress(): Promise<AdminProgress> {
  const db = getDatabase();
  await ensureNajahSchema(db);
  await ensureBundledDataset(db);

  const [episodeCountRow, evaluatorResult, coverageRow] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM episodes").first<CountRow>(),
    db.prepare(`
      SELECT
        u.user_id AS "raterId",
        u.display_name AS "displayName",
        u.email,
        u.created_at AS "joinedAt",
        COUNT(ra.episode_id) FILTER (WHERE ra.status = 'complete') AS "completedCount",
        COUNT(ra.episode_id) FILTER (WHERE ra.status = 'draft') AS "draftCount",
        MAX(ra.updated_at) AS "lastActivity"
      FROM users u
      LEFT JOIN rubric_annotations ra ON ra.rater_id = u.user_id
      WHERE u.role = 'rater'
      GROUP BY u.user_id, u.display_name, u.email, u.created_at
      ORDER BY
        COUNT(ra.episode_id) FILTER (WHERE ra.status = 'complete') DESC,
        LOWER(u.display_name),
        LOWER(u.email)
    `).all<RawEvaluatorProgress>(),
    db.prepare(`
      SELECT
        COUNT(*) FILTER (WHERE completed_count = 0) AS "noCompletedRating",
        COUNT(*) FILTER (WHERE completed_count = 1) AS "oneCompletedRating",
        COUNT(*) FILTER (WHERE completed_count >= 2) AS "twoOrMoreCompletedRatings"
      FROM (
        SELECT
          e.episode_id,
          COUNT(rating_user.user_id) FILTER (WHERE ra.status = 'complete') AS completed_count
        FROM episodes e
        LEFT JOIN rubric_annotations ra ON ra.episode_id = e.episode_id
        LEFT JOIN users rating_user
          ON rating_user.user_id = ra.rater_id
         AND rating_user.role = 'rater'
        GROUP BY e.episode_id
      ) episode_coverage
    `).first<RawCoverage>(),
  ]);

  const totalEpisodes = Number(episodeCountRow?.count ?? 0);
  const evaluators = evaluatorResult.results.map((row) => {
    const completedCount = Number(row.completedCount ?? 0);
    const draftCount = Number(row.draftCount ?? 0);
    const notStartedCount = Math.max(totalEpisodes - completedCount - draftCount, 0);
    const completionPercentage = totalEpisodes
      ? Math.round((completedCount / totalEpisodes) * 100)
      : 0;

    return {
      raterId: row.raterId,
      displayName: row.displayName,
      email: row.email,
      joinedAt: timestampToIso(row.joinedAt),
      completedCount,
      draftCount,
      notStartedCount,
      completionPercentage,
      lastActivity: timestampToIso(row.lastActivity),
    };
  });

  const completedRatings = evaluators.reduce(
    (total, evaluator) => total + evaluator.completedCount,
    0,
  );
  const draftRatings = evaluators.reduce(
    (total, evaluator) => total + evaluator.draftCount,
    0,
  );

  return {
    totalEpisodes,
    totalEvaluators: evaluators.length,
    activeEvaluators: evaluators.filter(
      (evaluator) => evaluator.completedCount + evaluator.draftCount > 0,
    ).length,
    completedRatings,
    draftRatings,
    // The protocol requires two independent completed ratings per episode.
    // Using all-raters × all-episodes would make 100% impossible once a third
    // evaluator joins because submission is deliberately capped at two.
    expectedRatings: totalEpisodes * 2,
    coverage: {
      noCompletedRating: Number(coverageRow?.noCompletedRating ?? 0),
      oneCompletedRating: Number(coverageRow?.oneCompletedRating ?? 0),
      twoOrMoreCompletedRatings: Number(
        coverageRow?.twoOrMoreCompletedRatings ?? 0,
      ),
    },
    evaluators,
  };
}
