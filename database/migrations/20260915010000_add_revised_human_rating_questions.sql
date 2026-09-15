ALTER TABLE rubric_annotations
  ADD COLUMN IF NOT EXISTS critical_evidence_turns_json TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS participant_responses_json TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS participant_response_other TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS module_episode_ending TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS stopping_factors_json TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS stopping_factors_evidence_turns TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS stopping_factors_explanation TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS gender_context_handling TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS most_useful_thing TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS suggested_improvement TEXT NOT NULL DEFAULT '';
