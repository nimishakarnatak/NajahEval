-- Preserve the rater's explanation whenever an episode is skipped.
ALTER TABLE rubric_annotations
  ADD COLUMN IF NOT EXISTS skip_reason TEXT NOT NULL DEFAULT '';
