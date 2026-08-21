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
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'rater')),
        failed_login_count INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        session_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS episodes (
        episode_id TEXT PRIMARY KEY,
        student_status TEXT NOT NULL DEFAULT 'unknown',
        language TEXT NOT NULL,
        module TEXT NOT NULL,
        treatment TEXT NOT NULL DEFAULT 'unknown',
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
      CREATE TABLE IF NOT EXISTS rubric_annotations (
        episode_id TEXT NOT NULL REFERENCES episodes(episode_id) ON DELETE CASCADE,
        rater_id TEXT NOT NULL,
        rater_email TEXT NOT NULL,
        scores_json TEXT NOT NULL DEFAULT '{}',
        evidence_turns_json TEXT NOT NULL DEFAULT '{}',
        justifications_json TEXT NOT NULL DEFAULT '{}',
        critical_flags_json TEXT NOT NULL DEFAULT '{}',
        critical_evidence_json TEXT NOT NULL DEFAULT '{}',
        comments TEXT NOT NULL DEFAULT '',
        rubric_version TEXT NOT NULL,
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
      CREATE INDEX IF NOT EXISTS idx_episodes_student_module_treatment
      ON episodes(student_status, module, treatment)
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_annotations_episode_status
      ON annotations(episode_id, status)
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_annotations_rater_status
      ON annotations(rater_id, status)
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_rubric_annotations_episode_status
      ON rubric_annotations(episode_id, status)
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_rubric_annotations_rater_status
      ON rubric_annotations(rater_id, status)
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
      ON auth_sessions(user_id)
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry
      ON auth_sessions(expires_at)
    `),
  ]);
  await db.prepare("PRAGMA optimize").run();
}
