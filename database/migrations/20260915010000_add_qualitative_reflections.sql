-- Optional, non-scored reflections recorded by each human evaluator.
--
-- The retired task-outcome columns are removed because the revised study will
-- collect new results with the updated instrument.

ALTER TABLE rubric_annotations
  ADD COLUMN IF NOT EXISTS most_useful_reflection TEXT NOT NULL DEFAULT '';

ALTER TABLE rubric_annotations
  ADD COLUMN IF NOT EXISTS improvement_reflection TEXT NOT NULL DEFAULT '';

ALTER TABLE rubric_annotations
  DROP COLUMN IF EXISTS task_status;

ALTER TABLE rubric_annotations
  DROP COLUMN IF EXISTS task_incomplete_reason;
