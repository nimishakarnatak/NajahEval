import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    userId: text("user_id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["admin", "rater"] }).notNull(),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: integer("locked_until"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_users_email").on(table.email)],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    sessionHash: text("session_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_auth_sessions_user").on(table.userId),
    index("idx_auth_sessions_expiry").on(table.expiresAt),
  ],
);

export const episodes = sqliteTable(
  "episodes",
  {
    episodeId: text("episode_id").primaryKey(),
    studentStatus: text("student_status").notNull().default("unknown"),
    language: text("language").notNull(),
    module: text("module").notNull(),
    treatment: text("treatment").notNull().default("unknown"),
    moduleObjective: text("module_objective").notNull().default(""),
    priorContext: text("prior_context").notNull().default(""),
    transcript: text("transcript").notNull(),
    privacyReviewStatus: text("privacy_review_status").notNull(),
    languageReviewStatus: text("language_review_status").notNull(),
    importBatch: text("import_batch").notNull().default("manual-import"),
    importedBy: text("imported_by").notNull(),
    importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_episodes_language_module").on(table.language, table.module),
    index("idx_episodes_student_module_treatment").on(
      table.studentStatus,
      table.module,
      table.treatment,
    ),
  ],
);

export const annotations = sqliteTable(
  "annotations",
  {
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.episodeId, { onDelete: "cascade" }),
    raterId: text("rater_id").notNull(),
    raterEmail: text("rater_email").notNull(),
    taskAchievement: integer("task_achievement"),
    relevance: integer("relevance"),
    actionability: integer("actionability"),
    clarity: integer("clarity"),
    safetyPrivacy: integer("safety_privacy"),
    culturalGenderSensitivity: integer("cultural_gender_sensitivity"),
    overallQuality: integer("overall_quality"),
    completionJudgment: text("completion_judgment").notNull().default(""),
    criticalIssueFlag: text("critical_issue_flag").notNull().default(""),
    raterConfidence: integer("rater_confidence"),
    comments: text("comments").notNull().default(""),
    status: text("status").notNull().default("draft"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.episodeId, table.raterId] }),
    index("idx_annotations_episode_status").on(table.episodeId, table.status),
    index("idx_annotations_rater_status").on(table.raterId, table.status),
  ],
);

/**
 * Evidence-based rubric annotations are stored separately from the original
 * 1–5 pilot ratings. This preserves the historical pilot data and prevents two
 * different instruments from being mixed under the same primary key.
 *
 * Scores, evidence, explanations, and flags are JSON objects keyed by the
 * stable identifiers in `lib/rubric.ts`. The CSV export expands these objects
 * into ordinary columns for straightforward analysis.
 */
export const rubricAnnotations = sqliteTable(
  "rubric_annotations",
  {
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.episodeId, { onDelete: "cascade" }),
    raterId: text("rater_id").notNull(),
    raterEmail: text("rater_email").notNull(),
    scoresJson: text("scores_json").notNull().default("{}"),
    evidenceTurnsJson: text("evidence_turns_json").notNull().default("{}"),
    justificationsJson: text("justifications_json").notNull().default("{}"),
    criticalFlagsJson: text("critical_flags_json").notNull().default("{}"),
    criticalEvidenceJson: text("critical_evidence_json").notNull().default("{}"),
    episodeEndReason: text("episode_end_reason").notNull().default(""),
    comments: text("comments").notNull().default(""),
    rubricVersion: text("rubric_version").notNull(),
    status: text("status").notNull().default("draft"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.episodeId, table.raterId] }),
    index("idx_rubric_annotations_episode_status").on(table.episodeId, table.status),
    index("idx_rubric_annotations_rater_status").on(table.raterId, table.status),
  ],
);
