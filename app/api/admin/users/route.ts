import { ensureNajahSchema, getDatabase } from "@/db";
import {
  invitedPasswordPlaceholder,
  INVITED_PASSWORD_PREFIX,
} from "@/lib/participant-accounts";
import { getRaterIdentity } from "@/lib/server-auth";
import { isParticipantRole, type ParticipantRole, type UserRole } from "@/lib/user-roles";

type ParticipantPayload = {
  userId?: string;
  displayName?: string;
  email?: string;
  role?: ParticipantRole;
  mode?: "remove" | "permanent";
};

type UserRow = {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  invited: boolean;
  createdAt: string | Date;
};

function normalizedEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

async function readPayload(request: Request): Promise<ParticipantPayload | null> {
  try {
    return (await request.json()) as ParticipantPayload;
  } catch {
    return null;
  }
}

async function requireAdmin(request: Request) {
  const user = await getRaterIdentity(request);
  return user?.role === "admin" ? user : null;
}

/** Return participant accounts and their access state to an administrator. */
export async function GET(request: Request) {
  if (!(await requireAdmin(request))) {
    return Response.json({ error: "Administrator access is required." }, { status: 403 });
  }

  const db = getDatabase();
  await ensureNajahSchema(db);
  const users = await db
    .prepare(`
      SELECT
        user_id AS "userId",
        email,
        display_name AS "displayName",
        role,
        is_active AS "isActive",
        (password_hash LIKE ?) AS invited,
        created_at AS "createdAt"
      FROM users
      ORDER BY
        CASE role WHEN 'admin' THEN 1 WHEN 'rater' THEN 2 ELSE 3 END,
        is_active DESC,
        LOWER(display_name),
        LOWER(email)
    `)
    .bind(`${INVITED_PASSWORD_PREFIX}%`)
    .all<UserRow>();

  return Response.json({ users: users.results });
}

/**
 * Add a Rater or Viewer before they sign in.
 *
 * The placeholder password cannot be used for authentication. The participant
 * claims the account through normal registration or verified Google sign-in,
 * and the role selected by the administrator is retained.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return Response.json({ error: "Administrator access is required." }, { status: 403 });
  }

  const payload = await readPayload(request);
  const displayName = payload?.displayName?.trim() ?? "";
  const email = normalizedEmail(payload?.email);
  const role = payload?.role;
  if (displayName.length < 2 || displayName.length > 80) {
    return Response.json({ error: "Enter the participant's full name." }, { status: 400 });
  }
  if (!validEmail(email)) {
    return Response.json({ error: "Enter a valid participant email." }, { status: 400 });
  }
  if (!isParticipantRole(role)) {
    return Response.json({ error: "Choose Rater or Viewer access." }, { status: 400 });
  }

  const configuredAdminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (email === configuredAdminEmail || email === admin.email) {
    return Response.json(
      { error: "The administrator account cannot be added as a participant." },
      { status: 400 },
    );
  }

  const db = getDatabase();
  await ensureNajahSchema(db);
  const existing = await db
    .prepare(`
      SELECT user_id AS "userId", is_active AS "isActive"
      FROM users
      WHERE email = ?
    `)
    .bind(email)
    .first<{ userId: string; isActive: boolean }>();

  if (existing?.isActive) {
    return Response.json(
      { error: "This participant already has access. Change their role in the list instead." },
      { status: 409 },
    );
  }

  if (existing) {
    await db
      .prepare(`
        UPDATE users
        SET display_name = ?, role = ?, is_active = TRUE,
            failed_login_count = 0, locked_until = NULL
        WHERE user_id = ?
      `)
      .bind(displayName, role, existing.userId)
      .run();
  } else {
    await db
      .prepare(`
        INSERT INTO users (
          user_id, email, display_name, password_hash, role, is_active
        ) VALUES (?, ?, ?, ?, ?, TRUE)
      `)
      .bind(crypto.randomUUID(), email, displayName, invitedPasswordPlaceholder(), role)
      .run();
  }

  return Response.json({ ok: true });
}

/** Change an active participant between Rater and Viewer access. */
export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return Response.json({ error: "Administrator access is required." }, { status: 403 });
  }

  const payload = await readPayload(request);
  const userId = payload?.userId?.trim() ?? "";
  if (!userId || !isParticipantRole(payload?.role)) {
    return Response.json({ error: "Choose a participant and a valid role." }, { status: 400 });
  }

  const db = getDatabase();
  await ensureNajahSchema(db);
  const target = await db
    .prepare(`SELECT email, role FROM users WHERE user_id = ? AND is_active = TRUE`)
    .bind(userId)
    .first<{ email: string; role: UserRole }>();
  const configuredAdminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!target) return Response.json({ error: "Participant not found." }, { status: 404 });
  if (target.role === "admin" || target.email === configuredAdminEmail || userId === admin.id) {
    return Response.json({ error: "Administrator access cannot be changed here." }, { status: 400 });
  }

  await db.prepare("UPDATE users SET role = ? WHERE user_id = ?").bind(payload.role, userId).run();
  return Response.json({ ok: true });
}

/**
 * Revoke access, or permanently delete an already-removed participant.
 *
 * Ordinary removal preserves saved work and can be reversed. Permanent
 * deletion is deliberately limited to inactive accounts and erases both legacy
 * and current rubric annotations before deleting the account itself.
 */
export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return Response.json({ error: "Administrator access is required." }, { status: 403 });
  }

  const payload = await readPayload(request);
  const userId = payload?.userId?.trim() ?? "";
  const permanent = payload?.mode === "permanent";
  if (!userId) return Response.json({ error: "Choose a participant." }, { status: 400 });

  const db = getDatabase();
  await ensureNajahSchema(db);
  const target = await db
    .prepare(`SELECT email, role, is_active AS "isActive" FROM users WHERE user_id = ?`)
    .bind(userId)
    .first<{ email: string; role: UserRole; isActive: boolean }>();
  const configuredAdminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!target) return Response.json({ error: "Participant not found." }, { status: 404 });
  if (target.role === "admin" || target.email === configuredAdminEmail || userId === admin.id) {
    return Response.json({ error: "The administrator account cannot be removed." }, { status: 400 });
  }

  if (permanent) {
    if (target.isActive) {
      return Response.json(
        { error: "Remove this participant's access before deleting the account permanently." },
        { status: 409 },
      );
    }
    await db.batch([
      db.prepare("DELETE FROM rubric_annotations WHERE rater_id = ?").bind(userId),
      db.prepare("DELETE FROM annotations WHERE rater_id = ?").bind(userId),
      db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(userId),
      db.prepare("DELETE FROM users WHERE user_id = ?").bind(userId),
    ]);
    return Response.json({ ok: true, permanentlyDeleted: true });
  }

  await db.batch([
    db.prepare("UPDATE users SET is_active = FALSE WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(userId),
  ]);
  return Response.json({ ok: true });
}
