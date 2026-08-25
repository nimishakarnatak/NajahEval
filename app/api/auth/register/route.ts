import { ensureNajahSchema, getDatabase } from "@/db";
import { issueSessionCookie } from "@/lib/auth-session";
import { isInvitedPassword } from "@/lib/participant-accounts";
import { hashPassword, passwordValidationError } from "@/lib/password-auth";
import type { UserRole } from "@/lib/user-roles";

type RegistrationPayload = {
  displayName?: string;
  email?: string;
  password?: string;
};

type ExistingUser = {
  userId: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
};

function normalizedEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function configuredAdminEmail(): string {
  return (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
}

export async function POST(request: Request) {
  const payload = (await request.json()) as RegistrationPayload;
  const displayName = (payload.displayName ?? "").trim();
  const email = normalizedEmail(payload.email);
  const password = payload.password ?? "";

  if (displayName.length < 2 || displayName.length > 80) {
    return Response.json({ error: "Enter your full name." }, { status: 400 });
  }
  if (!validEmail(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const passwordError = passwordValidationError(password);
  if (passwordError) {
    return Response.json({ error: passwordError }, { status: 400 });
  }
  const db = getDatabase();
  await ensureNajahSchema(db);
  const existing = await db
    .prepare(`
      SELECT
        user_id AS "userId",
        password_hash AS "passwordHash",
        role,
        is_active AS "isActive"
      FROM users
      WHERE email = ?
    `)
    .bind(email)
    .first<ExistingUser>();
  if (existing && !isInvitedPassword(existing.passwordHash)) {
    return Response.json({ error: "An account already exists for this email." }, { status: 409 });
  }

  const userId = existing?.userId ?? crypto.randomUUID();
  const role: UserRole = email === configuredAdminEmail()
    ? "admin"
    : existing?.role ?? "rater";
  let passwordHash: string;
  try {
    passwordHash = await hashPassword(password);
  } catch {
    return Response.json(
      { error: "Password protection is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
  try {
    if (existing) {
      // Claim an administrator-created participant record while preserving the
      // assigned Rater or Viewer role.
      await db
        .prepare(`
          UPDATE users
          SET display_name = ?, password_hash = ?, is_active = TRUE,
              failed_login_count = 0, locked_until = NULL
          WHERE user_id = ?
        `)
        .bind(displayName, passwordHash, userId)
        .run();
    } else {
      await db
        .prepare(`
          INSERT INTO users (user_id, email, display_name, password_hash, role)
          VALUES (?, ?, ?, ?, ?)
        `)
        .bind(userId, email, displayName, passwordHash, role)
        .run();
    }
  } catch {
    return Response.json(
      { error: "The account could not be created. Check whether it already exists." },
      { status: 409 },
    );
  }

  // Keep any work previously saved under the same email connected to the new
  // password account, so changing authentication methods does not hide drafts.
  await db
    .prepare("UPDATE annotations SET rater_id = ? WHERE lower(rater_email) = ?")
    .bind(userId, email)
    .run();
  await db
    .prepare("UPDATE rubric_annotations SET rater_id = ? WHERE lower(rater_email) = ?")
    .bind(userId, email)
    .run();

  const cookie = await issueSessionCookie(db, userId);
  return Response.json(
    { ok: true, rater: { displayName, email, role } },
    { headers: { "set-cookie": cookie } },
  );
}
