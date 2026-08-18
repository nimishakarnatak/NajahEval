import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const episodes = sqliteTable(
  "episodes",
  {
    episodeId: text("episode_id").primaryKey(),
    language: text("language").notNull(),
    module: text("module").notNull(),
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
