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
  assert.match(page, /Evaluator progress/);
  assert.match(page, /Completed ratings/);
  assert.match(page, /Draft ratings/);
  assert.match(page, /Not started/);
  assert.match(page, /Latest activity/);
  assert.match(page, /Independent-rating coverage/);
});
