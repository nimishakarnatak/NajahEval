-- Optional, non-scored reflections recorded by each human evaluator.
--
-- The legacy task-outcome columns remain in place so previously saved ratings
-- are auditable, but the revised rubric no longer writes or evaluates them.

ALTER TABLE rubric_annotations
  ADD COLUMN IF NOT EXISTS most_useful_reflection TEXT NOT NULL DEFAULT '';

ALTER TABLE rubric_annotations
  ADD COLUMN IF NOT EXISTS improvement_reflection TEXT NOT NULL DEFAULT '';
