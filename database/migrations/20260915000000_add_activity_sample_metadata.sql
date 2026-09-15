-- Analysis-only metadata for the completion-based activity sample.
--
-- These fields are stored with the episode so they can be included in
-- administrator exports. The rater-facing episode endpoint deliberately does
-- not select them, preventing activity group or participant gender from
-- influencing the blinded quality ratings.

ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS participant_gender TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS activity_group TEXT NOT NULL DEFAULT '';

ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS sampling_weight DOUBLE PRECISION;

ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS participant_sampling_probability DOUBLE PRECISION;

ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS focal_episode_selection_probability DOUBLE PRECISION;

ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS combined_episode_inclusion_probability DOUBLE PRECISION;

ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS activity_group_validation_status TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_episodes_activity_group
  ON episodes(activity_group);
