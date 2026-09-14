-- Reconfigure the 300-episode fielding workflow into three paired primary
-- batches and two reproducible 50-episode judge base samples. Serious
-- mismatches outside the samples are routed dynamically by the application.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS assignment_cohort TEXT NOT NULL DEFAULT 'unassigned';

ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS study_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS judge_base_assignment TEXT NOT NULL DEFAULT '';

ALTER TABLE rubric_annotations
  ADD COLUMN IF NOT EXISTS review_layer TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE rubric_annotations
  ADD COLUMN IF NOT EXISTS assignment_cohort TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_users_assignment_cohort
  ON users(assignment_cohort);

CREATE INDEX IF NOT EXISTS idx_episodes_study_order
  ON episodes(study_order);
