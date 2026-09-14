import { ensureNajahSchema, getDatabase } from "@/db";
import { hashPassword, passwordValidationError } from "@/lib/password-auth";
import { digestPasswordResetToken } from "@/lib/password-reset";

type ResetPasswordPayload = {
  token?: string;
  password?: string;
};

function acceptedRequest(request: Request): boolean {
  return (
    request.headers.get("origin") === new URL(request.url).origin &&
    request.headers.get("x-najah-auth") === "password-reset"
  );
}

/** Consume a valid single-use link, replace the password, and revoke old sessions. */
export async function POST(request: Request) {
  if (!acceptedRequest(request)) {
    return Response.json({ error: "This password-reset request was not accepted." }, { status: 403 });
  }

  let payload: ResetPasswordPayload;
  try {
    payload = (await request.json()) as ResetPasswordPayload;
  } catch {
    return Response.json({ error: "The password-reset request was invalid." }, { status: 400 });
  }
  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!token || token.length > 256) {
    return Response.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }
  const passwordError = passwordValidationError(password);
  if (passwordError) {
    return Response.json({ error: passwordError }, { status: 400 });
  }

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(password);
  } catch {
    return Response.json(
      { error: "Password protection is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }

  const db = getDatabase();
  await ensureNajahSchema(db);
  const now = Math.floor(Date.now() / 1000);
  const tokenHash = await digestPasswordResetToken(token);
  const consumed = await db.execute<{ userId: string }>(
    `
      UPDATE password_reset_tokens
      SET used_at = $1
      WHERE token_hash = $2
        AND used_at IS NULL
        AND expires_at > $1
        AND EXISTS (
          SELECT 1
          FROM users
          WHERE users.user_id = password_reset_tokens.user_id
            AND users.is_active = TRUE
        )
      RETURNING user_id AS "userId"
    `,
    [now, tokenHash],
  );
  const userId = consumed[0]?.userId;
  if (!userId) {
    return Response.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  // Revoking all sessions ensures a previously signed-in browser cannot keep
  // using the account after the password owner has recovered it.
  await db.batch([
    db
      .prepare(`
        UPDATE users
        SET password_hash = ?, failed_login_count = 0, locked_until = NULL
        WHERE user_id = ? AND is_active = TRUE
      `)
      .bind(passwordHash, userId),
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").bind(userId),
  ]);

  return Response.json({ ok: true, message: "Your password has been updated. You can now sign in." });
}
