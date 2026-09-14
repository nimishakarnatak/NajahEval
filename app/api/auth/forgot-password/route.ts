import { ensureNajahSchema, getDatabase } from "@/db";
import {
  PASSWORD_RESET_COOLDOWN_SECONDS,
  PASSWORD_RESET_GENERIC_MESSAGE,
  createPasswordResetToken,
  digestPasswordResetToken,
  passwordResetEmailConfiguration,
  passwordResetExpiryEpoch,
  sendPasswordResetEmail,
} from "@/lib/password-reset";
import { acceptsSameOriginMutation } from "@/lib/request-security";

type ForgotPasswordPayload = { email?: string };

type ResettableUser = {
  userId: string;
  email: string;
  displayName: string;
  passwordHash: string;
  isActive: boolean;
  lastRequestedAt: number | null;
};

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/**
 * Request a password-reset email without revealing whether an account exists.
 * Google-only and administrator-invited placeholder accounts intentionally
 * receive the same generic response but are not sent a password link.
 */
export async function POST(request: Request) {
  if (!acceptsSameOriginMutation(request, "password-reset")) {
    return Response.json({ error: "This password-reset request was not accepted." }, { status: 403 });
  }

  let payload: ForgotPasswordPayload;
  try {
    payload = (await request.json()) as ForgotPasswordPayload;
  } catch {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const email = (payload.email ?? "").trim().toLowerCase();
  if (!validEmail(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const emailConfiguration = passwordResetEmailConfiguration();
  if (!emailConfiguration) {
    return Response.json(
      { error: "Password-reset email is not configured yet. Please contact the administrator." },
      { status: 503 },
    );
  }

  const db = getDatabase();
  await ensureNajahSchema(db);
  const user = await db
    .prepare(`
      SELECT
        users.user_id AS "userId",
        users.email,
        users.display_name AS "displayName",
        users.password_hash AS "passwordHash",
        users.is_active AS "isActive",
        (
          SELECT EXTRACT(EPOCH FROM created_at)::BIGINT
          FROM password_reset_tokens
          WHERE user_id = users.user_id
          ORDER BY created_at DESC
          LIMIT 1
        ) AS "lastRequestedAt"
      FROM users
      WHERE users.email = ?
      LIMIT 1
    `)
    .bind(email)
    .first<ResettableUser>();

  const now = Math.floor(Date.now() / 1000);
  const hasPasswordAccount = user?.passwordHash.startsWith("pbkdf2-sha256$") ?? false;
  const wasRequestedRecently =
    user?.lastRequestedAt != null && now - Number(user.lastRequestedAt) < PASSWORD_RESET_COOLDOWN_SECONDS;

  // The response is deliberately identical for unknown, inactive, Google-only,
  // placeholder, and recently requested accounts to prevent account discovery.
  if (!user || !user.isActive || !hasPasswordAccount || wasRequestedRecently) {
    return Response.json({ ok: true, message: PASSWORD_RESET_GENERIC_MESSAGE });
  }

  const token = createPasswordResetToken();
  const tokenHash = await digestPasswordResetToken(token);
  const expiresAt = passwordResetExpiryEpoch(now);
  await db.batch([
    db.prepare("DELETE FROM password_reset_tokens WHERE expires_at <= ? OR used_at IS NOT NULL").bind(now),
    db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL").bind(user.userId),
    db
      .prepare(`
        INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
        VALUES (?, ?, ?)
      `)
      .bind(tokenHash, user.userId, expiresAt),
  ]);

  const resetUrl = new URL("/reset-password", new URL(request.url).origin);
  resetUrl.searchParams.set("token", token);
  try {
    await sendPasswordResetEmail({
      configuration: emailConfiguration,
      displayName: user.displayName,
      email: user.email,
      resetUrl: resetUrl.toString(),
      tokenHash,
    });
  } catch {
    try {
      await db
        .prepare("DELETE FROM password_reset_tokens WHERE token_hash = ?")
        .bind(tokenHash)
        .run();
    } catch {
      // The token remains unusable once it expires. Do not reveal delivery or
      // cleanup behavior because that would expose whether the account exists.
    }
    return Response.json({ ok: true, message: PASSWORD_RESET_GENERIC_MESSAGE });
  }

  return Response.json({ ok: true, message: PASSWORD_RESET_GENERIC_MESSAGE });
}
