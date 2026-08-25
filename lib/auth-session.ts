import {
  createSessionToken,
  digestSessionToken,
  sessionCookie,
  sessionExpiryEpoch,
} from "@/lib/password-auth";
import type { AppDatabase } from "@/db";

/** Create a seven-day server-side session and return its HttpOnly cookie. */
export async function issueSessionCookie(db: AppDatabase, userId: string): Promise<string> {
  const token = createSessionToken();
  const tokenHash = await digestSessionToken(token);
  const expiresAt = sessionExpiryEpoch();
  const now = Math.floor(Date.now() / 1000);

  await db.batch([
    db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(now),
    db
      .prepare(`
        INSERT INTO auth_sessions (session_hash, user_id, expires_at)
        VALUES (?, ?, ?)
      `)
      .bind(tokenHash, userId, expiresAt),
  ]);
  return sessionCookie(token);
}
