import { env } from "cloudflare:workers";

export function getD1(): D1Database {
  if (!env.DB) {
    throw new Error("The Najah annotation database is unavailable.");
  }
  return env.DB;
}

export async function ensureNajahSchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS episodes (
        episode_id TEXT PRIMARY KEY,
        language TEXT NOT NULL,
        module TEXT NOT NULL,
        module_objective TEXT NOT NULL DEFAULT '',
        prior_context TEXT NOT NULL DEFAULT '',
        transcript TEXT NOT NULL,
        privacy_review_status TEXT NOT NULL,
        language_review_status TEXT NOT NULL,
        import_batch TEXT NOT NULL DEFAULT 'manual-import',
        imported_by TEXT NOT NULL,
        imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS annotations (
        episode_id TEXT NOT NULL REFERENCES episodes(episode_id) ON DELETE CASCADE,
        rater_id TEXT NOT NULL,
        rater_email TEXT NOT NULL,
        task_achievement INTEGER,
        relevance INTEGER,
        actionability INTEGER,
        clarity INTEGER,
        safety_privacy INTEGER,
        cultural_gender_sensitivity INTEGER,
        overall_quality INTEGER,
        completion_judgment TEXT NOT NULL DEFAULT '',
        critical_issue_flag TEXT NOT NULL DEFAULT '',
        rater_confidence INTEGER,
        comments TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (episode_id, rater_id)
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_episodes_language_module
      ON episodes(language, module)
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_annotations_episode_status
      ON annotations(episode_id, status)
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_annotations_rater_status
      ON annotations(rater_id, status)
    `),
  ]);
  await db.prepare("PRAGMA optimize").run();
}
