CREATE TABLE `rubric_annotations` (
	`episode_id` text NOT NULL,
	`rater_id` text NOT NULL,
	`rater_email` text NOT NULL,
	`scores_json` text DEFAULT '{}' NOT NULL,
	`evidence_turns_json` text DEFAULT '{}' NOT NULL,
	`justifications_json` text DEFAULT '{}' NOT NULL,
	`critical_flags_json` text DEFAULT '{}' NOT NULL,
	`critical_evidence_json` text DEFAULT '{}' NOT NULL,
	`comments` text DEFAULT '' NOT NULL,
	`rubric_version` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`episode_id`, `rater_id`),
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`episode_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_rubric_annotations_episode_status` ON `rubric_annotations` (`episode_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_rubric_annotations_rater_status` ON `rubric_annotations` (`rater_id`,`status`);