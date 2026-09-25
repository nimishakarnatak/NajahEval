import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

test("defines three shared primary groups and two fixed 30-plus-30 judge plans", async () => {
  const [assignments, planSource, planJson] = await Promise.all([
    readFile(projectFile("lib/study-assignments.ts"), "utf8"),
    readFile(projectFile("lib/judge-review-plan.ts"), "utf8"),
    readFile(projectFile("data/judge-review-plan.json"), "utf8"),
  ]);
  const plan = JSON.parse(planJson);

  for (const group of ["group_a", "group_b", "group_c"]) {
    assert.match(assignments, new RegExp(`value: "${group}"[\\s\\S]*?episodeCount: 100[\\s\\S]*?capacity: null`));
  }
  for (const judge of ["judge_1", "judge_2"]) {
    assert.match(assignments, new RegExp(`value: "${judge}"[\\s\\S]*?episodeCount: 60[\\s\\S]*?capacity: 1`));
    assert.equal(plan.judges[judge].priority.length, 30);
    assert.equal(plan.judges[judge].optional.length, 30);
  }
  const allIds = Object.values(plan.judges).flatMap((judge) => [
    ...judge.priority,
    ...judge.optional,
  ]);
  assert.equal(new Set(allIds).size, 120);
  assert.match(assignments, /judgeEpisodeIds\(assignment\)\.includes\(episodeId\)/);
  assert.match(planSource, /judgeQueueTierForEpisode/);
  assert.match(planSource, /judgeAssignmentForPlannedEpisode/);
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
  assert.match(episodes, /judgeEpisodeSqlList/);
  assert.match(episodes, /judgeQueueTierForEpisode/);
  assert.match(episodes, /judgeQueueOrderForEpisode/);
  assert.match(annotations, /assignmentIncludesEpisode/);
  assert.match(annotations, /review_layer, assignment_cohort/);
  assert.match(annotations, /reviewLayer !== "admin_demo"/);
  assert.match(users, /assignmentCapacity/);
  assert.match(users, /capacity === null/);
  assert.match(users, /capacity/);
  assert.match(requirements, /Math\.max/);
  assert.match(requirements, /REQUIRED_PRIMARY_RATINGS_PER_EPISODE/);
  assert.match(episodes, /requiredRatingsForAssignment/);
  assert.match(annotations, /requiredRatingsForAssignment/);
  assert.match(schema, /review_layer TEXT NOT NULL DEFAULT 'legacy'/);
});

test("routes serious mismatches and highlights disputed fields without revealing primary answers", async () => {
  const [episodes, annotations, app, mismatch] = await Promise.all([
    readFile(projectFile("app/api/episodes/route.ts"), "utf8"),
    readFile(projectFile("app/api/annotations/route.ts"), "utf8"),
    readFile(projectFile("app/AnnotatorApp.tsx"), "utf8"),
    readFile(projectFile("lib/rating-mismatch.ts"), "utf8"),
  ]);

  assert.match(episodes, /COUNT\(\*\) >= 2/);
  assert.match(episodes, /COUNT\(DISTINCT primary_rating\.scores_json\) > 1/);
  assert.match(episodes, /COUNT\(DISTINCT primary_rating\.task_status\) > 1/);
  assert.match(episodes, /COUNT\(DISTINCT primary_rating\.critical_flags_json\) > 1/);
  assert.match(episodes, /reviewLayer === "judge"/);
  assert.match(episodes, /primary_serious_mismatch/);
  assert.match(episodes, /primary_score_mismatch_keys_json/);
  assert.match(episodes, /primaryMismatchDetails/);
  assert.match(mismatch, /values\.has\(1\) && values\.has\(3\)/);
  assert.match(mismatch, /values\.has\("na"\)/);
  assert.match(episodes, /BOOL_OR\(score_entry\.value = '1'\)/);
  assert.match(episodes, /BOOL_OR\(score_entry\.value = '3'\)/);
  assert.match(app, /Top 10 percent/);
  assert.match(app, /Next 10 percent/);
  assert.match(app, /judgePriorityNotStarted/);
  assert.match(app, /judgePriorityCompleted/);
  assert.match(app, /judgeOptionalNotStarted/);
  assert.match(app, /judgeOptionalCompleted/);
  assert.match(app, /Serious primary-rating mismatch—judge review required/);
  assert.match(app, /Primary raters disagreed here/);
  assert.match(app, /Questions with primary-rater disagreement/);
  assert.match(app, /Select a question to jump to it/);
  assert.match(app, /mismatchReviewItems/);
  assert.match(app, /hasPrimaryMismatch/);
  assert.match(app, /highlightedMismatch/);
  assert.match(app, /primary answers remain hidden/i);
  assert.match(app, /Complete only the orange-highlighted questions/);
  assert.match(app, /isFocusedJudgeReview \? highlightedMismatch : null/);
  assert.match(annotations, /isFocusedJudgeReview \? primaryMismatchSummary\.details : null/);
  assert.doesNotMatch(annotations, /episode\.judgeBaseAssignment !== rater\.assignmentCohort/);
  assert.match(mismatch, /details: PrimaryMismatchDetails/);
  assert.match(mismatch, /scoreKeys: scoreMismatchKeys/);
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
