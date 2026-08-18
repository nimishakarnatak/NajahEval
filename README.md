# Najah Review Studio

A private, privacy-aware web workspace for human evaluation of de-identified
Najah guidance episodes.

## Annotator workflow

- Import the manually approved blinded CSV.
- Filter episodes by queue, language, module, or status.
- Read relevant prior context and the complete module transcript.
- Score seven evaluation dimensions on a 1–5 scale.
- Record completion, critical issues, confidence, and comments.
- Save drafts automatically and submit completed ratings.
- Export the signed-in annotator's own work as CSV.

The application stores episodes and annotations in D1. Annotators never see
another rater's scores, only the number of completed independent ratings.

## Privacy gate

The importer rejects rows unless all of the following are true:

- `do_not_release` is false;
- `release_eligible` is true;
- `privacy_review_status` is `approved`; and
- language review is not pending.

The current pipeline output remains blocked until manual review is completed.

## Local development

```bash
pnpm install
pnpm dev
```

The local preview seeds three synthetic episodes. Hosted environments begin
empty and require an approved CSV import.
