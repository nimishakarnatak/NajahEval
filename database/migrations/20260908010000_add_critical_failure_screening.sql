-- Preserve the first-stage critical-failure judgment separately from the
-- selected failure categories. This distinguishes an explicit No from a
-- Cannot determine judgment in analysis exports.
ALTER TABLE rubric_annotations
  ADD COLUMN IF NOT EXISTS critical_failure_observed TEXT NOT NULL DEFAULT '';
