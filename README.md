# Najah Review Studio

A full-stack human-evaluation workspace for rating the reviewed, de-identified
Najah module episodes. The repository includes the final 300-episode annotation
sample, independent rater accounts, drafts, completed ratings, progress views,
CSV export, optional Google sign-in, and secure password recovery.

Administrative and rating permissions are independent. The configured owner
can be an **Admin + Rater**, submit clearly separated demo ratings under the same account,
and enable or remove only their rater status from the dashboard. Removing rater
status never removes administrator access or historical CSV rows.

## Important privacy note

The repository contains `data/najah_final_annotation_dataset.csv`. Keep the
GitHub repository private unless the dataset has been formally approved for
public release. The application currently allows open account registration, so
anyone who finds a public deployment URL can create an account. New accounts
receive no episode queue until an administrator makes a study assignment.
Reintroduce an allowlist or invitation gate if account creation itself must be
limited to the eight authorized evaluators.

## Deployment architecture

```text
GitHub pull request ──> GitHub Actions checks
                    └─> Netlify deploy preview build

GitHub main branch ───> Netlify Next.js build
                    └─> Neon Postgres (external free database)
                         ├─ users and sessions
                         ├─ drafts and completed ratings
                         └─ 300 bundled episodes, seeded on first use
```

The 300-row CSV remains version-controlled and read-only. The first authenticated
request performs one parameterized bulk upsert into Postgres; future requests
only run a count check. Dataset versions are isolated by an import marker, so a
new sample replaces the active queue without deleting historical episodes or
ratings. User accounts and annotations are durable and are never stored in a
serverless function's temporary filesystem.

## Activity-based sampling design

The dataset bundled for the next release samples 100 unique participants from
each of three completion-based activity groups. Low means exactly one
uncompleted module with at least seven participant turns; Medium means exactly
one completed module; and High means at least one completed module plus another
distinct module started. One focal module episode is selected per participant.

Activity is descriptive, not a proxy for positive engagement. High activity can
reflect productive work, persistence, confusion, retries, or technical issues.
The activity measure and group are deliberately omitted from the rater-facing
API and interface so they cannot influence human judgments.

The 300 focal episodes are ordered so that every primary-rater cohort contains
100 episodes and 33 or 34 participants from each activity group:

| Primary cohort | Low | Medium | High | Total |
| --- | ---: | ---: | ---: | ---: |
| Group A | 34 | 33 | 33 | 100 |
| Group B | 33 | 34 | 33 | 100 |
| Group C | 33 | 33 | 34 | 100 |

The server validates this allocation when loading the bundled CSV and refuses
an incorrectly ordered activity-stratified dataset. This prevents rater-team
severity from becoming inseparable from participant activity.

The bundled version retains explicit pending-review metadata. Project-owner
processing approval has been recorded, while the separate human completion and
episode-level privacy checks remain auditable. If a completion decision changes,
sampling must be rerun before treating the activity classifications as final.
The versioned import creates a new active database batch without deleting or
silently reconnecting ratings from the earlier dataset.

The database stores participant gender, activity group, sampling probabilities,
and privacy-review status for administrator exports. These analysis and audit
fields are not selected by the rater-facing episode endpoint.

## Evaluator assignment design

The 300 episodes are fielded through two distinct review layers:

- **Group A:** every assigned blinded primary rater independently rates study orders 1–100.
- **Group B:** every assigned blinded primary rater independently rates study orders 101–200.
- **Group C:** every assigned blinded primary rater independently rates study orders 201–300.
- **Judge 1 (Rita):** reviews 30 priority episodes (Top 10 percent), followed by 30 optional episodes (Next 10 percent).
- **Judge 2 (Fatine):** reviews a distinct set of 30 priority episodes, followed by 30 optional episodes.

The verified judge plan contains 120 unique episodes: 60 assigned to each
judge, with no overlap. Each judge should complete the 30 priority episodes
first and continue to the 30 optional episodes if time permits. The rubric
highlights the exact questions on which primary raters disagreed, while keeping
their identities and answers hidden. Judges may submit only those highlighted
questions.

The design requires at least 600 primary ratings, increasing when more primary
raters are assigned, plus one judge review for each selected judge episode.
Administrator demo ratings and pre-assignment legacy ratings are stored and
exportable, but do not count toward required study coverage.

The administrator assigns accounts to groups from the dashboard. Group A, B,
and C have no fixed membership limit; each judge assignment has capacity for
one active judge. An unassigned rater sees no study episodes until
the administrator selects a queue.

## Publish from GitHub to Netlify

### 1. Push this directory to GitHub

From the repository root:

```bash
git add .
git commit -m "Prepare Najah Review Studio for Netlify"
git branch -M main
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
git push -u origin main
```

If `origin` already exists, replace the `git remote add` command with:

```bash
git remote set-url origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
```

### 2. Create the external Postgres database

The Netlify account used for this project does not include Netlify Database.
Create a free project at [Neon](https://console.neon.tech/), select **Connect**,
and copy its `postgresql://...` connection string. The application uses Neon's
serverless HTTP driver and creates its idempotent schema on first use.

The same schema is also available for inspection or manual application at
`database/migrations/20260825000000_create_najah_schema.sql`.

### 3. Connect the repository in Netlify

1. In Netlify, select **Add new project** → **Import an existing project**.
2. Choose GitHub and select the repository.
3. Netlify reads `netlify.toml`; keep the build command as `pnpm build` and the
   publish directory as `.next`.
4. Do not enable Netlify Database. Database storage is supplied by Neon.

### 4. Configure environment variables

In **Project configuration** → **Environment variables**, add:

- `DATABASE_URL`: the Neon Postgres connection string. Mark it as a secret and
  scope it to the Production deploy context unless previews need their own
  separate Neon database branch.
- `ADMIN_EMAIL`: the email address that should receive administrator rights.
- `GOOGLE_CLIENT_ID`: optional Google Web client ID. Password registration and
  login work without it.
- `RESEND_API_KEY`: server-only Resend API key used to send password-reset links.
- `PASSWORD_RESET_FROM_EMAIL`: sender name and address on a domain verified in
  Resend, for example `Najah Review Studio <accounts@updates.example.org>`.

Never use a `NEXT_PUBLIC_` prefix for `DATABASE_URL`; it must remain server-only.

For Google sign-in, create a **Web application** OAuth client in Google Cloud
Console and add both the Netlify URL and any custom domain to **Authorized
JavaScript origins**. Then set the same client ID as `GOOGLE_CLIENT_ID` and
redeploy.

For password recovery, verify a sending domain in Resend, create an API key,
and add both password-reset variables above. The sign-in page then emails a
single-use reset link that expires after 30 minutes. The request response never
confirms whether an account exists. Completing a reset signs the account out on
other devices while preserving its ratings, role, and assigned queue.

### 5. Deploy and verify before inviting raters

1. Select **Retry deploy** in Netlify after saving the environment variables.
2. Create the administrator account using `ADMIN_EMAIL`. It initially receives
   both Admin and Rater access.
3. Assign the six primary raters and two judges in the administration dashboard.
4. Confirm Group A, B, and C accounts each show 100 episodes, and Judge 1 and
   Judge 2 accounts each show 30 Top-10-percent episodes and 30 Next-10-percent
   episodes.
5. Save one draft, sign out and back in, and confirm it is still present.
6. Submit one rating and export **My work**.
7. Create a separate test-rater account and confirm it cannot see the first
   rater's scores.

## Local development

Copy `.env.example` to `.env.local`, set its `DATABASE_URL` to a development Neon
database or branch, and then run:

```bash
pnpm install
pnpm dev
```

The first database-backed request creates missing tables and indexes. No Netlify
CLI database command is required.

## Quality checks

```bash
pnpm lint
pnpm test
```

GitHub Actions runs both checks on pull requests and pushes to `main`. If Netlify
deploy previews need working logins, give them a separate Neon database branch;
do not expose the production `DATABASE_URL` to untrusted preview deployments.

## Annotation and import behavior

- Raters filter by module, treatment, and personal work state.
- Administrator demo annotations appear in the administrator's individual CSV
  and in the all-layers export, but are excluded from primary and judge progress.
  Historical ratings remain exportable if an account's rater status is later
  removed. Export columns identify the account role, current assignment, saved
  review layer, and assignment at the time of rating.
- Every rubric dimension requires a score of 1, 2, 3, or N/A. Score
  justifications and evidence turn numbers are available but optional.
- Every completed rating separately records task outcome, observable
  participant responses, the module-episode ending, and gender-context
  handling. When applicable, raters also code observable factors immediately
  before stopping; evidence and a short explanation are required whenever a
  stopping factor is selected.
- A written reason is required when an evaluator skips an episode. Evidence
  turn numbers and a short explanation are required for every selected critical
  failure. Two optional qualitative reflections support process evaluation but
  are excluded from numerical quality scores.
- Evaluators never see another evaluator's scores; they see only the completed
  count for their own review layer. The judge workspace separates Top 10 percent
  from Next 10 percent and shows Not started, Draft, Done, Remaining, and Total
  counts for each. Judges receive field-level mismatch signals without the
  primary raters' identities or score values.
- Privacy and language-review fields are retained as metadata but currently do
  not gate import. Revisit that temporary decision before external data release.
- The evidence rubric is stored in `rubric_annotations`, separately from the
  original pilot `annotations` table, preserving historical work.
