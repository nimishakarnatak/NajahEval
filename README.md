# Najah Review Studio

A full-stack human-evaluation workspace for rating the reviewed, de-identified
Najah module episodes. The repository includes the final 300-episode annotation
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
                    └─> Netlify deploy preview + isolated database branch

GitHub main branch ───> Netlify Next.js build
                    └─> Netlify Database (managed Postgres)
                         ├─ users and sessions
                         ├─ drafts and completed ratings
                         └─ 300 bundled episodes, seeded on first use
```

The 300-row CSV remains version-controlled and read-only. The first authenticated
request performs one parameterized bulk upsert into Postgres; future requests
only run a count check. User accounts and annotations are durable and are never
stored in a serverless function's temporary filesystem.

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

### 2. Connect the repository in Netlify

1. In Netlify, select **Add new project** → **Import an existing project**.
2. Choose GitHub and select the repository.
3. Netlify reads `netlify.toml`; keep the build command as `pnpm build` and the
   publish directory as `.next`.
4. Deploy the project. Netlify detects the SQL migration in
   `netlify/database/migrations` and provisions/applies Netlify Database before
   publishing. If the dashboard asks you to enable a database, choose
   **Database** → **Create database**, then redeploy.

The migration is versioned with the code. A migration failure blocks publication
instead of letting new application code run against an incompatible schema.

### 3. Configure environment variables

In **Project configuration** → **Environment variables**, add:

- `ADMIN_EMAIL`: the email address that should receive administrator rights.
- `GOOGLE_CLIENT_ID`: optional Google Web client ID. Password registration and
  login work without it.

Do not set `DATABASE_URL` on Netlify unless deliberately replacing Netlify
Database with another Postgres provider; the official database package selects
the correct production or deploy-preview branch automatically.

For Google sign-in, create a **Web application** OAuth client in Google Cloud
Console and add both the Netlify URL and any custom domain to **Authorized
JavaScript origins**. Then set the same client ID as `GOOGLE_CLIENT_ID` and
redeploy.

### 4. Verify before inviting raters

1. Create the administrator account using `ADMIN_EMAIL`.
2. Confirm the queue shows 300 episodes.
3. Save one draft, sign out and back in, and confirm it is still present.
4. Submit one rating and export **My work**.
5. Create a separate test-rater account and confirm it cannot see the first
   rater's scores.

## Local development

Install dependencies and use Netlify's local runtime so the database migration
and Postgres connection match production:

```bash
pnpm install
pnpm dlx netlify-cli database init
pnpm dlx netlify-cli dev
```

The project also accepts an initialized external Postgres database through
`DATABASE_URL`. Copy `.env.example` to `.env.local`, apply the SQL migration to
that database, and then run `pnpm dev`.

## Quality checks

```bash
pnpm lint
pnpm test
```

GitHub Actions runs both checks on pull requests and pushes to `main`. Netlify
creates deploy previews for pull requests; Netlify Database gives each preview
an isolated database branch, so test ratings do not modify production data.

## Annotation and import behavior

- Raters filter by student status, module, treatment, and personal work state.
- Score justifications are optional. Evidence turn numbers remain required for
  assessed dimensions, and evidence is required for critical-failure flags set
  to **Yes**.
- Every completed rating records why the observed module episode ended.
- Annotators never see another rater's scores; they see only the count of
  independent completed ratings.
- Privacy and language-review fields are retained as metadata but currently do
  not gate import. Revisit that temporary decision before external data release.
- The evidence rubric is stored in `rubric_annotations`, separately from the
  original pilot `annotations` table, preserving historical work.
