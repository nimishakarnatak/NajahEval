import { ensureNajahSchema, getDatabase } from "@/db";
import {
  invitedPasswordPlaceholder,
  INVITED_PASSWORD_PREFIX,
} from "@/lib/participant-accounts";
import {
  BUNDLED_DATASET_VERSION,
  ensureBundledDataset,
} from "@/lib/bundled-dataset";
import { getRaterIdentity } from "@/lib/server-auth";
import {
  assignmentCapacity,
  isAssignmentCohort,
  isAssignedCohort,
  isJudgeCohort,
  type AssignmentCohort,
} from "@/lib/study-assignments";
import { isParticipantRole, type ParticipantRole, type UserRole } from "@/lib/user-roles";

type ParticipantPayload = {
  userId?: string;
  displayName?: string;
  email?: string;
  role?: ParticipantRole;
  canRate?: boolean;
  assignmentCohort?: AssignmentCohort;
  mode?: "remove" | "permanent" | "rating_access" | "assignment";
};

type UserRow = {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  canRate: boolean;
  assignmentCohort: AssignmentCohort;
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

/** Fixed SQL predicates for the five base assignments; no user input is interpolated. */
function assignmentEpisodePredicate(assignment: AssignmentCohort): string {
  if (assignment === "group_a") return "e.study_order BETWEEN 1 AND 100";
  if (assignment === "group_b") return "e.study_order BETWEEN 101 AND 200";
  if (assignment === "group_c") return "e.study_order BETWEEN 201 AND 300";
  if (assignment === "judge_1") return "e.judge_base_assignment = 'judge_1'";
  if (assignment === "judge_2") return "e.judge_base_assignment = 'judge_2'";
  return "FALSE";
}

/** Prevent accidental over-allocation beyond two primary raters or one judge. */
async function assignmentAvailabilityError(
  db: ReturnType<typeof getDatabase>,
  assignment: AssignmentCohort,
  excludedUserId = "",
): Promise<string | null> {
  if (!isAssignedCohort(assignment)) return null;
  const row = await db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM users
      WHERE is_active = TRUE
        AND can_rate = TRUE
        AND assignment_cohort = ?
        AND user_id != ?
    `)
    .bind(assignment, excludedUserId)
    .first<{ count: number | string }>();
  const capacity = assignmentCapacity(assignment);
  if (Number(row?.count ?? 0) < capacity) return null;
  return isJudgeCohort(assignment)
    ? "This judge assignment already has its one active judge."
    : "This primary group already has its two active raters.";
}

/**
 * Preserve preliminary work by attaching matching legacy ratings to a newly
 * assigned study layer. Ratings outside the new queue remain historical.
 */
async function adoptMatchingLegacyRatings(
  db: ReturnType<typeof getDatabase>,
  userId: string,
  assignment: AssignmentCohort,
): Promise<void> {
  if (!isAssignedCohort(assignment)) return;
  await ensureBundledDataset(db);
  const reviewLayer = isJudgeCohort(assignment) ? "judge" : "primary";
  await db
    .prepare(`
      UPDATE rubric_annotations ra
      SET review_layer = ?, assignment_cohort = ?
      FROM episodes e
      WHERE ra.episode_id = e.episode_id
        AND ra.rater_id = ?
        AND ra.review_layer = 'legacy'
        AND e.import_batch = ?
        AND ${assignmentEpisodePredicate(assignment)}
    `)
    .bind(reviewLayer, assignment, userId, BUNDLED_DATASET_VERSION)
    .run();
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
        can_rate AS "canRate",
        assignment_cohort AS "assignmentCohort",
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
  const assignment = role === "rater" && isAssignmentCohort(payload?.assignmentCohort)
    ? payload.assignmentCohort
    : "unassigned";
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

  const capacityError = await assignmentAvailabilityError(
    db,
    assignment,
    existing?.userId ?? "",
  );
  if (capacityError) {
    return Response.json({ error: capacityError }, { status: 409 });
  }

  if (existing) {
    await db
      .prepare(`
        UPDATE users
        SET display_name = ?, role = ?, can_rate = ?, assignment_cohort = ?, is_active = TRUE,
            failed_login_count = 0, locked_until = NULL
        WHERE user_id = ?
      `)
      .bind(displayName, role, role === "rater", assignment, existing.userId)
      .run();
    await adoptMatchingLegacyRatings(db, existing.userId, assignment);
  } else {
    await db
      .prepare(`
        INSERT INTO users (
          user_id, email, display_name, password_hash, role, can_rate,
          assignment_cohort, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
      `)
      .bind(
        crypto.randomUUID(),
        email,
        displayName,
        invitedPasswordPlaceholder(),
        role,
        role === "rater",
        assignment,
      )
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
  if (!userId) {
    return Response.json({ error: "Choose an account." }, { status: 400 });
  }

  const db = getDatabase();
  await ensureNajahSchema(db);

  if (payload?.mode === "assignment") {
    const assignment = payload.assignmentCohort;
    if (!isAssignmentCohort(assignment)) {
      return Response.json({ error: "Choose a valid study assignment." }, { status: 400 });
    }
    const target = await db
      .prepare(`
        SELECT email, role, can_rate AS "canRate"
        FROM users
        WHERE user_id = ? AND is_active = TRUE
      `)
      .bind(userId)
      .first<{ email: string; role: UserRole; canRate: boolean }>();
    const configuredAdminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
    if (!target) return Response.json({ error: "Participant not found." }, { status: 404 });
    if (target.role === "admin" || target.email === configuredAdminEmail || userId === admin.id) {
      return Response.json({ error: "The administrator assignment cannot be changed here." }, { status: 400 });
    }
    if (target.role !== "rater" || !target.canRate) {
      return Response.json({ error: "Only active raters can receive a study assignment." }, { status: 400 });
    }
    const capacityError = await assignmentAvailabilityError(db, assignment, userId);
    if (capacityError) return Response.json({ error: capacityError }, { status: 409 });

    await db
      .prepare("UPDATE users SET assignment_cohort = ? WHERE user_id = ?")
      .bind(assignment, userId)
      .run();
    await adoptMatchingLegacyRatings(db, userId, assignment);
    return Response.json({ ok: true, assignmentCohort: assignment });
  }

  // Administrative access remains protected while the owner independently
  // enables or disables their own ability to create ratings.
  if (payload?.mode === "rating_access") {
    if (userId !== admin.id || typeof payload.canRate !== "boolean") {
      return Response.json(
        { error: "Administrators may change only their own rater status." },
        { status: 400 },
      );
    }
    await db
      .prepare("UPDATE users SET can_rate = ? WHERE user_id = ? AND role = 'admin'")
      .bind(payload.canRate, userId)
      .run();
    return Response.json({ ok: true, canRate: payload.canRate });
  }

  if (!isParticipantRole(payload?.role)) {
    return Response.json({ error: "Choose a participant and a valid role." }, { status: 400 });
  }

  const target = await db
    .prepare(`SELECT email, role FROM users WHERE user_id = ? AND is_active = TRUE`)
    .bind(userId)
    .first<{ email: string; role: UserRole }>();
  const configuredAdminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!target) return Response.json({ error: "Participant not found." }, { status: 404 });
  if (target.role === "admin" || target.email === configuredAdminEmail || userId === admin.id) {
    return Response.json({ error: "Administrator access cannot be changed here." }, { status: 400 });
  }

  await db
    .prepare("UPDATE users SET role = ?, can_rate = ?, assignment_cohort = ? WHERE user_id = ?")
    .bind(
      payload.role,
      payload.role === "rater",
      "unassigned",
      userId,
    )
    .run();
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
