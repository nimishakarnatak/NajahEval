CREATE TABLE `annotations` (
	`episode_id` text NOT NULL,
	`rater_id` text NOT NULL,
	`rater_email` text NOT NULL,
	`task_achievement` integer,
	`relevance` integer,
	`actionability` integer,
	`clarity` integer,
	`safety_privacy` integer,
	`cultural_gender_sensitivity` integer,
	`overall_quality` integer,
	`completion_judgment` text DEFAULT '' NOT NULL,
	`critical_issue_flag` text DEFAULT '' NOT NULL,
	`rater_confidence` integer,
	`comments` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`episode_id`, `rater_id`),
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`episode_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_annotations_episode_status` ON `annotations` (`episode_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_annotations_rater_status` ON `annotations` (`rater_id`,`status`);--> statement-breakpoint
CREATE TABLE `episodes` (
	`episode_id` text PRIMARY KEY NOT NULL,
	`language` text NOT NULL,
	`module` text NOT NULL,
	`module_objective` text DEFAULT '' NOT NULL,
	`prior_context` text DEFAULT '' NOT NULL,
	`transcript` text NOT NULL,
	`privacy_review_status` text NOT NULL,
	`language_review_status` text NOT NULL,
	`import_batch` text DEFAULT 'manual-import' NOT NULL,
	`imported_by` text NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_episodes_language_module` ON `episodes` (`language`,`module`);