import { env } from "cloudflare:workers";

import { ensureNajahSchema, getD1 } from "@/db";
import { issueSessionCookie } from "@/lib/auth-session";
import {
  hashPassword,
  passwordValidationError,
  secretsMatch,
} from "@/lib/password-auth";

type RegistrationPayload = {
  displayName?: string;
  email?: string;
  password?: string;
  invitationCode?: string;
};

const MAX_RATER_ACCOUNTS = 3;

function normalizedEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function configuredInvitationCode(request: Request): string | null {
  const configured = (env as unknown as { REGISTRATION_CODE?: string }).REGISTRATION_CODE;
  if (configured) return configured;
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1"
    ? "NAJAH-LOCAL-INVITE"
    : null;
}

export async function POST(request: Request) {
  const payload = (await request.json()) as RegistrationPayload;
  const displayName = (payload.displayName ?? "").trim();
  const email = normalizedEmail(payload.email);
  const password = payload.password ?? "";
  const invitationCode = payload.invitationCode ?? "";
  const expectedInvitationCode = configuredInvitationCode(request);

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
  if (
    !expectedInvitationCode ||
    !(await secretsMatch(invitationCode.trim(), expectedInvitationCode))
  ) {
    return Response.json({ error: "The invitation code is not valid." }, { status: 403 });
  }

  const db = getD1();
  await ensureNajahSchema(db);
  const [existing, accountCount] = await Promise.all([
    db.prepare("SELECT user_id FROM users WHERE email = ?").bind(email).first(),
    db.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>(),
  ]);
  if (existing) {
    return Response.json({ error: "An account already exists for this email." }, { status: 409 });
  }
  if ((accountCount?.count ?? 0) >= MAX_RATER_ACCOUNTS) {
    return Response.json({ error: "All three rater accounts have already been created." }, { status: 409 });
  }

  const userId = crypto.randomUUID();
  const role = (accountCount?.count ?? 0) === 0 ? "admin" : "rater";
  const passwordHash = await hashPassword(password);
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
