-- Store only one-way digests of short-lived password-reset bearer tokens.
-- A used token remains briefly available for audit and can never be reused.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  used_at BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expiry
  ON password_reset_tokens(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_unused_user
  ON password_reset_tokens(user_id)
  WHERE used_at IS NULL;
