# Najah Review Studio

A full-stack human-evaluation workspace for rating the reviewed, de-identified
Najah module episodes. The repository includes the final 300-participant annotation
sample, independent rater accounts, drafts, completed ratings, progress views,
CSV export, and optional Google sign-in.

## Important privacy note

The repository contains `data/najah_final_annotation_dataset.csv`. Keep the
GitHub repository private unless the dataset has been formally approved for
public release. The application currently allows open account registration, so
anyone who finds a public deployment URL can create an account and read every
episode. Reintroduce an allowlist or invitation gate before publishing if access
must be limited to the three authorized raters.

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
2. Create the administrator account using `ADMIN_EMAIL`.
3. Confirm the queue shows 300 episodes.
4. Save one draft, sign out and back in, and confirm it is still present.
5. Submit one rating and export **My work**.
6. Create a separate test-rater account and confirm it cannot see the first
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

- Raters filter by student status, module, treatment, and personal work state.
- Score justifications and routine evidence turn numbers are optional. Evidence
  remains required for critical-failure flags set to **Yes**.
- Every completed rating records task status. If the task was not completed, a
  second required field records the observable reason the interaction stopped.
- Annotators never see another rater's scores; they see only the count of
  independent completed ratings.
- Privacy and language-review fields are retained as metadata but currently do
  not gate import. Revisit that temporary decision before external data release.
- The evidence rubric is stored in `rubric_annotations`, separately from the
  original pilot `annotations` table, preserving historical work.
