import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

test("defines three unlimited shared groups and two reproducible 50-episode judge samples", async () => {
  const [assignments, dataset] = await Promise.all([
    readFile(projectFile("lib/study-assignments.ts"), "utf8"),
    readFile(projectFile("lib/bundled-dataset.ts"), "utf8"),
  ]);

  for (const group of ["group_a", "group_b", "group_c"]) {
    assert.match(assignments, new RegExp(`value: "${group}"[\\s\\S]*?episodeCount: 100[\\s\\S]*?capacity: null`));
  }
  for (const judge of ["judge_1", "judge_2"]) {
    assert.match(assignments, new RegExp(`value: "${judge}"[\\s\\S]*?episodeCount: 50[\\s\\S]*?capacity: 2`));
  }
  assert.match(assignments, /if \(baseAssignment\) return baseAssignment/);
  assert.match(assignments, /order % 2 === 1 \? "judge_1" : "judge_2"/);
  assert.match(dataset, /assignJudgeBaseSamples/);
  assert.match(dataset, /judge1: 17, judge2: 16/);
  assert.match(dataset, /judge1: 17, judge2: 17/);
  assert.match(dataset, /judge1: 16, judge2: 17/);
  assert.match(dataset, /judge1Count !== 50 \|\| judge2Count !== 50/);
});

test("enforces assignment visibility, flexible primary membership, and separate saved review layers", async () => {
  const [episodes, annotations, users, schema, requirements] = await Promise.all([
    readFile(projectFile("app/api/episodes/route.ts"), "utf8"),
    readFile(projectFile("app/api/annotations/route.ts"), "utf8"),
    readFile(projectFile("app/api/admin/users/route.ts"), "utf8"),
    readFile(projectFile("db/schema.ts"), "utf8"),
    readFile(projectFile("lib/server-assignment-requirements.ts"), "utf8"),
  ]);

  assert.match(episodes, /e\.study_order BETWEEN 1 AND 100/);
  assert.match(episodes, /e\.study_order BETWEEN 101 AND 200/);
  assert.match(episodes, /e\.study_order BETWEEN 201 AND 300/);
  assert.match(episodes, /e\.judge_base_assignment = 'judge_1'/);
  assert.match(episodes, /e\.judge_base_assignment = 'judge_2'/);
  assert.match(episodes, /primary_summary\.primary_serious_mismatch/);
  assert.match(annotations, /assignmentIncludesEpisode/);
  assert.match(annotations, /review_layer, assignment_cohort/);
  assert.match(annotations, /reviewLayer !== "admin_demo"/);
  assert.match(users, /assignmentCapacity/);
  assert.match(users, /capacity === null/);
  assert.match(users, /two active judges/);
  assert.match(requirements, /Math\.max/);
  assert.match(requirements, /REQUIRED_PRIMARY_RATINGS_PER_EPISODE/);
  assert.match(episodes, /requiredRatingsForAssignment/);
  assert.match(annotations, /requiredRatingsForAssignment/);
  assert.match(schema, /review_layer TEXT NOT NULL DEFAULT 'legacy'/);
});

test("routes serious mismatches and notifies judges without revealing primary scores", async () => {
  const [episodes, app, mismatch] = await Promise.all([
    readFile(projectFile("app/api/episodes/route.ts"), "utf8"),
    readFile(projectFile("app/AnnotatorApp.tsx"), "utf8"),
    readFile(projectFile("lib/rating-mismatch.ts"), "utf8"),
  ]);

  assert.match(episodes, /COUNT\(\*\) >= 2/);
  assert.match(episodes, /COUNT\(DISTINCT primary_rating\.scores_json\) > 1/);
  assert.doesNotMatch(episodes, /COUNT\(DISTINCT primary_rating\.task_status\) > 1/);
  assert.match(episodes, /COUNT\(DISTINCT primary_rating\.critical_flags_json\) > 1/);
  assert.match(episodes, /reviewLayer === "judge"/);
  assert.match(episodes, /primary_serious_mismatch/);
  assert.match(mismatch, /values\.has\(1\) && values\.has\(3\)/);
  assert.match(mismatch, /values\.has\("na"\)/);
  assert.match(app, /Mismatch reviews/);
  assert.match(app, /Random assignments/);
  assert.match(app, /mismatchNotStarted/);
  assert.match(app, /mismatchCompleted/);
  assert.match(app, /judgeRandomNotStarted/);
  assert.match(app, /judgeRandomCompleted/);
  assert.match(app, /Serious primary-rating mismatch—judge review required/);
  assert.match(app, /individual scores remain hidden/i);
});

test("keeps unassigned accounts out of study queues until an admin assigns them", async () => {
  const [app, episodes, annotations, manager] = await Promise.all([
    readFile(projectFile("app/AnnotatorApp.tsx"), "utf8"),
    readFile(projectFile("app/api/episodes/route.ts"), "utf8"),
    readFile(projectFile("app/api/annotations/route.ts"), "utf8"),
    readFile(projectFile("app/admin/AdminParticipantManager.tsx"), "utf8"),
  ]);

  assert.match(episodes, /return "FALSE"/);
  assert.match(annotations, /Your study assignment is pending/);
  assert.match(app, /Your study assignment is pending/);
  assert.match(manager, /Pending assignment/);
  assert.match(manager, /Study assignment/);
});
