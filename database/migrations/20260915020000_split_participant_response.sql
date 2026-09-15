ALTER TABLE rubric_annotations
  ADD COLUMN IF NOT EXISTS participant_behaviours_json TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS participant_behaviour_evidence_turns_json TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS participant_behaviour_other TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS participant_reactions_json TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS participant_reaction_evidence_turns_json TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS participant_reaction_other TEXT NOT NULL DEFAULT '';
