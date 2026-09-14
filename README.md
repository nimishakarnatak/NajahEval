# Najah Review Studio

A full-stack human-evaluation workspace for rating the reviewed, de-identified
Najah module episodes. The repository includes the final 300-episode annotation
sample, independent rater accounts, drafts, completed ratings, progress views,
CSV export, and optional Google sign-in.

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

The current dataset samples 100 unique participants from each of three
separated activity groups: low (1-4 participant turns), medium (8-12), and high
(20 or more). Activity is calculated across every eligible module episode in a
participant's available history before one focal episode is selected. Najah
messages are excluded. Participants with 5-7 or 13-19 turns remain in a
transition group for later scale analyses but are not sampled initially.

Activity is descriptive, not a proxy for positive engagement. High activity can
reflect productive work, persistence, confusion, retries, or technical issues.
The activity measure and group are deliberately omitted from the rater-facing
CSV so they cannot influence human judgments.

## Evaluator assignment design

The 300 episodes are fielded through two distinct review layers:

- **Group A:** two blinded primary raters independently rate study orders 1–100.
- **Group B:** two blinded primary raters independently rate study orders 101–200.
- **Group C:** two blinded primary raters independently rate study orders 201–300.
- **Judge 1:** one judge reviews a fixed random sample of 50 episodes plus assigned serious mismatches.
- **Judge 2:** one judge reviews a separate fixed random sample of 50 episodes plus assigned serious mismatches.

The 100 base judge episodes are selected reproducibly from episode IDs and do
not overlap. They are balanced across Groups A-C: Judge 1 receives 17/17/16 and
Judge 2 receives 16/17/17 episodes from those groups. Once both primary ratings
have been submitted, a serious mismatch outside the base sample is added to one
judge's queue using a deterministic, non-overlapping allocation rule. A serious
mismatch is a 1-versus-3 score, N/A-versus-substantive score, different task
status or incomplete-task reason, or different critical-failure judgment.

The design therefore requires 600 primary ratings and 100 base judge reviews,
plus one judge review for each serious mismatch outside the base samples.
Ordinary primary-rating differences are shown as alerts only when the episode
is already in the judge's base sample. Judges never see either primary rater's
identity or actual answers.
Administrator demo ratings and pre-assignment legacy ratings are stored and
exportable, but do not count toward required study coverage.

The administrator assigns accounts to groups from the dashboard. A Group A, B,
or C assignment has capacity for two active raters; a judge assignment has
capacity for one active judge. An unassigned rater sees no study episodes until
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

Never use a `NEXT_PUBLIC_` prefix for `DATABASE_URL`; it must remain server-only.

For Google sign-in, create a **Web application** OAuth client in Google Cloud
Console and add both the Netlify URL and any custom domain to **Authorized
JavaScript origins**. Then set the same client ID as `GOOGLE_CLIENT_ID` and
redeploy.

### 5. Deploy and verify before inviting raters

1. Select **Retry deploy** in Netlify after saving the environment variables.
2. Create the administrator account using `ADMIN_EMAIL`. It initially receives
   both Admin and Rater access.
3. Assign the six primary raters and two judges in the administration dashboard.
4. Confirm Group A, B, and C accounts each show 100 episodes, and Judge 1 and
   Judge 2 accounts each show their 50-episode random base sample. Their totals
   can increase when serious mismatch cases are detected.
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
  justifications and evidence turn numbers are available but optional. A
  written explanation is required only when an evaluator skips an episode or
  selects a critical failure.
- Every completed rating records task status. If the task was not completed, a
  second required field records the observable reason the interaction stopped.
- Evaluators never see another evaluator's scores; they see only the completed
  count for their own review layer. The judge workspace separates fixed random
  assignments from mismatch reviews and shows Not started, Draft, Done,
  Remaining, and Total counts for each. Judges receive mismatch signals without
  the primary raters' identities or score values.
- Privacy and language-review fields are retained as metadata but currently do
  not gate import. Revisit that temporary decision before external data release.
- The evidence rubric is stored in `rubric_annotations`, separately from the
  original pilot `annotations` table, preserving historical work.
