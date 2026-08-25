import { ensureNajahSchema, getDatabase } from "@/db";
import { issueSessionCookie } from "@/lib/auth-session";
import { verifyGoogleIdToken } from "@/lib/google-identity";
import { isInvitedPassword } from "@/lib/participant-accounts";
import type { UserRole } from "@/lib/user-roles";

type GoogleLoginPayload = { credential?: string };
type ExistingUser = {
  userId: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
};

function configuredValue(name: "GOOGLE_CLIENT_ID" | "ADMIN_EMAIL"): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Create an application session from a verified Google identity.
 *
 * New Google users are registered automatically. If the verified email already
 * has a password account, the same database user is reused so drafts and
 * completed ratings are never split between two identities.
 */
export async function POST(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  if (
    request.headers.get("origin") !== requestOrigin ||
    request.headers.get("x-najah-auth") !== "google"
  ) {
    return Response.json({ error: "This sign-in request was not accepted." }, { status: 403 });
  }

  const clientId = configuredValue("GOOGLE_CLIENT_ID");
  if (!clientId) {
    return Response.json(
      { error: "Google sign-in has not been configured yet." },
      { status: 503 },
    );
  }

  let payload: GoogleLoginPayload;
  try {
    payload = (await request.json()) as GoogleLoginPayload;
  } catch {
    return Response.json({ error: "The sign-in request was invalid." }, { status: 400 });
  }
  if (!payload.credential || typeof payload.credential !== "string") {
    return Response.json({ error: "Google did not return a sign-in credential." }, { status: 400 });
  }

  let googleIdentity;
  try {
    googleIdentity = await verifyGoogleIdToken(payload.credential, clientId);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to verify Google sign-in." },
      { status: 401 },
    );
  }

  const db = getDatabase();
  await ensureNajahSchema(db);
  let user = await db
    .prepare(`
      SELECT
        user_id AS "userId",
        email,
        display_name AS "displayName",
        password_hash AS "passwordHash",
        role,
        is_active AS "isActive"
      FROM users
      WHERE email = ?
      LIMIT 1
    `)
    .bind(googleIdentity.email)
    .first<ExistingUser>();

  const role = googleIdentity.email === configuredValue("ADMIN_EMAIL") ? "admin" : "rater";
  if (!user) {
    const userId = crypto.randomUUID();
    // This deliberately does not match the password hash format, so a
    // Google-only account cannot be entered through the password endpoint.
    const passwordHash = `google-identity-only$${googleIdentity.subject}`;
    await db
      .prepare(`
        INSERT INTO users (user_id, email, display_name, password_hash, role)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(userId, googleIdentity.email, googleIdentity.displayName, passwordHash, role)
      .run();
    user = {
      userId,
      email: googleIdentity.email,
      displayName: googleIdentity.displayName,
      passwordHash,
      role,
      isActive: true,
    };
  } else if (!user.isActive) {
    return Response.json(
      { error: "Your access to this workspace has been removed." },
      { status: 403 },
    );
  } else if (role === "admin" && user.role !== "admin") {
    await db.prepare("UPDATE users SET role = 'admin' WHERE user_id = ?").bind(user.userId).run();
    user.role = "admin";
  }

  // A participant invited from the admin dashboard can claim the placeholder
  // record through verified Google sign-in while keeping the assigned role.
  if (isInvitedPassword(user.passwordHash)) {
    const claimedPasswordHash = `google-identity-only$${googleIdentity.subject}`;
    await db
      .prepare("UPDATE users SET password_hash = ?, display_name = ? WHERE user_id = ?")
      .bind(claimedPasswordHash, googleIdentity.displayName, user.userId)
      .run();
    user.passwordHash = claimedPasswordHash;
    user.displayName = googleIdentity.displayName;
  }

  // Reconnect any historical annotations that were saved under the same
  // verified email before application-owned accounts were introduced.
  await db.batch([
    db
      .prepare("UPDATE annotations SET rater_id = ? WHERE lower(rater_email) = ?")
      .bind(user.userId, googleIdentity.email),
    db
      .prepare("UPDATE rubric_annotations SET rater_id = ? WHERE lower(rater_email) = ?")
      .bind(user.userId, googleIdentity.email),
  ]);

  const cookie = await issueSessionCookie(db, user.userId);
  return Response.json(
    {
      ok: true,
      rater: { displayName: user.displayName, email: user.email, role: user.role },
    },
    { headers: { "set-cookie": cookie } },
  );
}
