/**
 * Idempotent PostgreSQL schema used when a fresh external database is first
 * accessed. The first advisory-lock statement serializes concurrent startup
 * attempts; the lock is released automatically when the transaction ends.
 */
export const NAJAH_SCHEMA_STATEMENTS = [
  "SELECT pg_advisory_xact_lock(6820260825)",
  `
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'rater', 'viewer')),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      failed_login_count INTEGER NOT NULL DEFAULT 0,
      locked_until BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS auth_sessions (
      session_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  `
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
      imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  `
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
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (episode_id, rater_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS rubric_annotations (
      episode_id TEXT NOT NULL REFERENCES episodes(episode_id) ON DELETE CASCADE,
      rater_id TEXT NOT NULL,
      rater_email TEXT NOT NULL,
      scores_json TEXT NOT NULL DEFAULT '{}',
      evidence_turns_json TEXT NOT NULL DEFAULT '{}',
      justifications_json TEXT NOT NULL DEFAULT '{}',
      critical_flags_json TEXT NOT NULL DEFAULT '{}',
      critical_evidence_json TEXT NOT NULL DEFAULT '{}',
      episode_end_reason TEXT NOT NULL DEFAULT '',
      task_status TEXT NOT NULL DEFAULT '',
      task_incomplete_reason TEXT NOT NULL DEFAULT '',
      comments TEXT NOT NULL DEFAULT '',
      rubric_version TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (episode_id, rater_id)
    )
  `,
  "CREATE INDEX IF NOT EXISTS idx_episodes_language_module ON episodes(language, module)",
  "CREATE INDEX IF NOT EXISTS idx_episodes_student_module_treatment ON episodes(student_status, module, treatment)",
  "CREATE INDEX IF NOT EXISTS idx_annotations_episode_status ON annotations(episode_id, status)",
  "CREATE INDEX IF NOT EXISTS idx_annotations_rater_status ON annotations(rater_id, status)",
  "CREATE INDEX IF NOT EXISTS idx_rubric_annotations_episode_status ON rubric_annotations(episode_id, status)",
  "CREATE INDEX IF NOT EXISTS idx_rubric_annotations_rater_status ON rubric_annotations(rater_id, status)",
  "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at)",
] as const;

/**
 * Idempotent upgrades for databases created by earlier releases.
 *
 * Access removal is deliberately represented by `is_active` instead of deleting
 * a user. This preserves the person's historical ratings for analysis while
 * preventing both new sessions and reuse of an existing session.
 */
export const NAJAH_SCHEMA_MIGRATION_STATEMENTS = [
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",
  "ALTER TABLE rubric_annotations ADD COLUMN IF NOT EXISTS task_status TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE rubric_annotations ADD COLUMN IF NOT EXISTS task_incomplete_reason TEXT NOT NULL DEFAULT ''",
  `
    DO $$
    DECLARE
      role_constraint TEXT;
    BEGIN
      SELECT pg_get_constraintdef(oid)
      INTO role_constraint
      FROM pg_constraint
      WHERE conrelid = 'users'::regclass
        AND conname = 'users_role_check';

      IF role_constraint IS NULL OR role_constraint NOT LIKE '%viewer%' THEN
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
        ALTER TABLE users
          ADD CONSTRAINT users_role_check
          CHECK (role IN ('admin', 'rater', 'viewer'));
      END IF;
    END
    $$
  `,
] as const;
