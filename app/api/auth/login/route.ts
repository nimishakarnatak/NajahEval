import { ensureNajahSchema, getDatabase } from "@/db";
import { issueSessionCookie } from "@/lib/auth-session";
import { hashPassword, verifyPassword } from "@/lib/password-auth";
import type { UserRole } from "@/lib/user-roles";

type LoginPayload = { email?: string; password?: string };

type LoginUser = {
  userId: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
  canRate: boolean;
  isActive: boolean;
  failedLoginCount: number;
  lockedUntil: number | null;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as LoginPayload;
  const email = (payload.email ?? "").trim().toLowerCase();
  const password = payload.password ?? "";
  if (!email || !password) {
    return Response.json({ error: "Enter your email and password." }, { status: 400 });
  }

  const db = getDatabase();
  await ensureNajahSchema(db);
  const user = await db
    .prepare(`
      SELECT
        user_id AS "userId",
        email,
        display_name AS "displayName",
        password_hash AS "passwordHash",
        role,
        can_rate AS "canRate",
        is_active AS "isActive",
        failed_login_count AS "failedLoginCount",
        locked_until AS "lockedUntil"
      FROM users
      WHERE email = ?
    `)
    .bind(email)
    .first<LoginUser>();

  const now = Math.floor(Date.now() / 1000);
  if (user?.lockedUntil && user.lockedUntil > now) {
    return Response.json(
      { error: "Too many unsuccessful attempts. Try again in 15 minutes." },
      { status: 429 },
    );
  }

  // Perform equivalent password-hashing work for unknown emails. This keeps
  // response timing from revealing whether a particular address is registered.
  if (!user) await hashPassword(password);
  const passwordMatches = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !user.isActive || !passwordMatches) {
    if (user?.isActive) {
      const nextFailureCount = user.failedLoginCount + 1;
      const shouldLock = nextFailureCount >= 5;
      await db
        .prepare(`
          UPDATE users
          SET failed_login_count = ?, locked_until = ?
          WHERE user_id = ?
        `)
        .bind(shouldLock ? 0 : nextFailureCount, shouldLock ? now + 15 * 60 : null, user.userId)
        .run();
    }
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (adminEmail && user.email === adminEmail && user.role !== "admin") {
    await db
      .prepare("UPDATE users SET role = 'admin', can_rate = TRUE WHERE user_id = ?")
      .bind(user.userId)
      .run();
    user.role = "admin";
    user.canRate = true;
  }

  await db
    .prepare("UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE user_id = ?")
    .bind(user.userId)
    .run();
  const cookie = await issueSessionCookie(db, user.userId);
  return Response.json(
    {
      ok: true,
      rater: {
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        canRate: user.canRate,
      },
    },
    { headers: { "set-cookie": cookie } },
  );
}
