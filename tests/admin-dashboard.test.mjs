import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

test("protects evaluator progress on both the admin page and API", async () => {
  const [page, route] = await Promise.all([
    readFile(projectFile("app/admin/page.tsx"), "utf8"),
    readFile(projectFile("app/api/admin/progress/route.ts"), "utf8"),
  ]);

  assert.match(page, /admin\.role !== "admin"/);
  assert.match(page, /redirect\("\/"\)/);
  assert.match(route, /rater\.role !== "admin"/);
  assert.match(route, /status: 401/);
  assert.match(route, /status: 403/);
});

test("calculates progress for every rater and excludes administrator accounts", async () => {
  const progress = await readFile(projectFile("lib/admin-progress.ts"), "utf8");

  assert.match(progress, /ensureBundledDataset\(db\)/);
  assert.match(progress, /WHERE u\.role = 'rater'/);
  assert.match(progress, /FILTER \(WHERE ra\.status = 'complete'\)/);
  assert.match(progress, /FILTER \(WHERE ra\.status = 'draft'\)/);
  assert.match(progress, /notStartedCount/);
  assert.match(progress, /completionPercentage/);
  assert.match(progress, /twoOrMoreCompletedRatings/);
  assert.match(progress, /expectedRatings: totalEpisodes \* 2/);
  assert.match(progress, /rating_user\.role = 'rater'/);
});

test("shows the dashboard link only to administrators and renders evaluator detail", async () => {
  const [app, page] = await Promise.all([
    readFile(projectFile("app/AnnotatorApp.tsx"), "utf8"),
    readFile(projectFile("app/admin/page.tsx"), "utf8"),
  ]);

  assert.match(app, /rater\.role === "admin"/);
  assert.match(app, /href="\/admin"/);
  assert.match(page, /Participants and evaluator progress/);
  assert.match(page, /Completed ratings/);
  assert.match(page, /Draft ratings/);
  assert.match(page, /Not started/);
  assert.match(page, /Latest activity/);
  assert.match(page, /Independent-rating coverage/);
});

test("lets administrators manage raters and read-only viewers without deleting ratings", async () => {
  const [page, manager, route, schema, annotations, app, serverAuth] = await Promise.all([
    readFile(projectFile("app/admin/page.tsx"), "utf8"),
    readFile(projectFile("app/admin/AdminParticipantManager.tsx"), "utf8"),
    readFile(projectFile("app/api/admin/users/route.ts"), "utf8"),
    readFile(projectFile("db/schema.ts"), "utf8"),
    readFile(projectFile("app/api/annotations/route.ts"), "utf8"),
    readFile(projectFile("app/AnnotatorApp.tsx"), "utf8"),
    readFile(projectFile("lib/server-auth.ts"), "utf8"),
  ]);

  assert.match(page, /AdminParticipantManager/);
  assert.match(manager, /Add participant/);
  assert.match(manager, /Rater/);
  assert.match(manager, /Viewer/);
  assert.match(manager, /Remove/);
  assert.match(manager, /Restore/);
  assert.match(route, /Administrator access is required/);
  assert.match(route, /UPDATE users SET is_active = FALSE/);
  assert.match(route, /DELETE FROM auth_sessions/);
  assert.doesNotMatch(route, /DELETE FROM rubric_annotations/);
  assert.match(schema, /'admin', 'rater', 'viewer'/);
  assert.match(schema, /is_active BOOLEAN NOT NULL DEFAULT TRUE/);
  assert.match(annotations, /Viewer accounts can read conversations but cannot save ratings/);
  assert.match(app, /Read-only dataset/);
  assert.match(app, /!readOnly &&/);
  assert.match(serverAuth, /ADMIN_EMAIL/);
  assert.match(serverAuth, /UPDATE users SET role = 'admin'/);
});
