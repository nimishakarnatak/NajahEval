import { env } from "cloudflare:workers";

import { ensureNajahSchema, getD1 } from "@/db";
import { issueSessionCookie } from "@/lib/auth-session";
import { hashPassword, passwordValidationError } from "@/lib/password-auth";

type RegistrationPayload = {
  displayName?: string;
  email?: string;
  password?: string;
};

function normalizedEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function configuredAdminEmail(): string {
  return ((env as unknown as { ADMIN_EMAIL?: string }).ADMIN_EMAIL ?? "")
    .trim()
    .toLowerCase();
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
  const db = getD1();
  await ensureNajahSchema(db);
  const existing = await db.prepare("SELECT user_id FROM users WHERE email = ?").bind(email).first();
  if (existing) {
    return Response.json({ error: "An account already exists for this email." }, { status: 409 });
  }

  const userId = crypto.randomUUID();
  const role = email === configuredAdminEmail() ? "admin" : "rater";
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
    await db
      .prepare(`
        INSERT INTO users (user_id, email, display_name, password_hash, role)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(userId, email, displayName, passwordHash, role)
      .run();
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

  const cookie = await issueSessionCookie(db, userId);
  return Response.json(
    { ok: true, rater: { displayName, email, role } },
    { headers: { "set-cookie": cookie } },
  );
}
