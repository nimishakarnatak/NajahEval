# Najah Review Studio

A private, privacy-aware web workspace for human evaluation of de-identified
Najah guidance episodes.

## Annotator workflow

- Import the manually approved blinded CSV.
- Filter episodes by queue, language, module, or status.
- Read relevant prior context and the complete module transcript.
- Score five turn-level and four module-level dimensions on the anchored 1–3
  scale, with explicit N/A only when a dimension cannot genuinely be assessed.
- Cite the relevant turn number(s) for every assessed dimension.
- Add a short justification for every score of 1 or 2 and for every N/A.
- Record Yes or No for each of the six critical-failure flags; every Yes also
  requires exact turn evidence and an explanation.
- Save drafts automatically and submit completed ratings.
- Export the signed-in annotator's own work as a flat, analysis-ready CSV.

The application stores episodes and annotations in D1. Annotators never see
another rater's scores, only the number of completed independent ratings. The
evidence-based rubric is stored in `rubric_annotations`, separately from the
original 1–5 pilot table, so historical ratings remain intact.

## Import behavior

During the current review phase, the importer accepts every row with an episode
ID and transcript. Privacy, language-review, and release fields are retained as
metadata but do not gate import. This temporary behavior should be revisited
before any dataset is released outside the authorized review team.

## Local development

```bash
pnpm install
pnpm dev
```

The local preview seeds three synthetic episodes. Hosted environments begin
empty and require an approved CSV import.
