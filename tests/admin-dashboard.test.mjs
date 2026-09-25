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

test("calculates flexible primary-group and judge progress without counting admin demos", async () => {
  const [progress, policy] = await Promise.all([
    readFile(projectFile("lib/admin-progress.ts"), "utf8"),
    readFile(projectFile("lib/rating-policy.ts"), "utf8"),
  ]);

  assert.match(progress, /ensureBundledDataset\(db\)/);
  assert.match(progress, /WHERE u\.can_rate = TRUE/);
  assert.match(progress, /saved\.rater_id = u\.user_id/);
  assert.match(progress, /u\.can_rate AS "canRate"/);
  assert.match(progress, /ra\.review_layer = 'admin_demo'/);
  assert.match(progress, /ra\.review_layer IN \('primary', 'judge'\)/);
  assert.match(progress, /notStartedCount/);
  assert.match(progress, /completionPercentage/);
  assert.match(policy, /REQUIRED_PRIMARY_RATINGS_PER_EPISODE = 2/);
  assert.match(policy, /REQUIRED_JUDGE_RATINGS_PER_EPISODE = 1/);
  assert.match(progress, /onePrimaryRating/);
  assert.match(progress, /primaryComplete/);
  assert.match(progress, /judgePending/);
  assert.match(progress, /judgeComplete/);
  assert.match(progress, /expectedRatings: assignments\.reduce/);
  assert.match(progress, /option\.capacity \?\? Math\.max/);
  assert.match(progress, /judgeAssignmentForPlannedEpisode/);
  assert.match(progress, /summarizePrimaryMismatch/);
  assert.match(progress, /ASSIGNMENT_OPTIONS\.map/);
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
  assert.match(page, /Required review coverage/);
  assert.match(page, /Progress by assigned team/);
  assert.match(page, /expectedPrimaryRatings/);
  assert.match(page, /expectedJudgeReviews/);
  assert.match(page, /30 priority episodes/);
  assert.match(page, /30 optional episodes/);
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
  assert.match(manager, /Study assignment/);
  assert.match(manager, /Primary rater/);
  assert.match(manager, /Judge/);
  assert.match(manager, /mode: "assignment"/);
  assert.match(manager, /Remove/);
  assert.match(manager, /Restore/);
  assert.match(route, /Administrator access is required/);
  assert.match(route, /UPDATE users SET is_active = FALSE/);
  assert.match(route, /DELETE FROM auth_sessions/);
  assert.match(route, /if \(permanent\)/);
  assert.match(route, /if \(target\.isActive\)/);
  assert.match(route, /DELETE FROM rubric_annotations/);
  assert.match(route, /DELETE FROM annotations/);
  assert.match(route, /DELETE FROM users/);
  assert.match(manager, /Delete permanently/);
  assert.match(manager, /Remove rater status/);
  assert.match(manager, /Add rater status/);
  assert.match(manager, /mode: "rating_access"/);
  assert.match(manager, /Type \$\{user\.email\} to confirm/);
  assert.match(manager, /mode: "permanent"/);
  assert.match(schema, /'admin', 'rater', 'viewer'/);
  assert.match(schema, /is_active BOOLEAN NOT NULL DEFAULT TRUE/);
  assert.match(schema, /can_rate BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(schema, /assignment_cohort TEXT NOT NULL DEFAULT 'unassigned'/);
  assert.match(schema, /study_order INTEGER NOT NULL DEFAULT 0/);
  assert.match(annotations, /Rater status is required to save or submit ratings/);
  assert.match(annotations, /!rater\.canRate/);
  assert.match(app, /Read-only dataset/);
  assert.match(app, /!readOnly &&/);
  assert.match(app, /userAccessLabel\(rater\.role, rater\.canRate\)/);
  assert.match(serverAuth, /ADMIN_EMAIL/);
  assert.match(serverAuth, /role = 'admin', can_rate = TRUE/);
});

test("provides evaluator, primary, judge, and combined administrator exports", async () => {
  const [page, exportsPanel, exportsRoute, exporter, app] = await Promise.all([
    readFile(projectFile("app/admin/page.tsx"), "utf8"),
    readFile(projectFile("app/admin/AdminRatingExports.tsx"), "utf8"),
    readFile(projectFile("app/api/admin/exports/route.ts"), "utf8"),
    readFile(projectFile("lib/annotation-export.ts"), "utf8"),
    readFile(projectFile("app/AnnotatorApp.tsx"), "utf8"),
  ]);

  assert.match(page, /AdminRatingExports/);
  assert.match(exportsPanel, /analysis files/);
  assert.match(exportsPanel, /Download primary CSV/);
  assert.match(exportsPanel, /Download judge CSV/);
  assert.match(exportsPanel, /Download all-layers CSV/);
  assert.match(exportsPanel, /both drafts and completed ratings/);
  assert.match(exportsRoute, /admin\.role !== "admin"/);
  assert.match(exportsRoute, /requestedScope === "combined"/);
  assert.match(exportsRoute, /requestedScope === "primary"/);
  assert.match(exportsRoute, /requestedScope === "judge"/);
  assert.doesNotMatch(exportsRoute, /annotation_user\.role <> 'admin'/);
  assert.match(exportsRoute, /can_rate = TRUE/);
  assert.match(exportsRoute, /content-disposition/);
  assert.match(exportsRoute, /private, no-store/);
  assert.match(exporter, /rater_email/);
  assert.match(exporter, /rater_status_active/);
  assert.match(exporter, /rater_current_assignment/);
  assert.match(exporter, /review_layer/);
  assert.match(exporter, /rating_assignment_cohort/);
  assert.match(exporter, /study_order/);
  assert.match(exporter, /participant_gender/);
  assert.match(exporter, /activity_group/);
  assert.doesNotMatch(exporter, /activity_group_validation_status/);
  assert.doesNotMatch(exporter, /privacy_review_status/);
  assert.match(exporter, /sampling_weight/);
  assert.match(exportsRoute, /e\.participant_gender AS "participantGender"/);
  assert.match(exportsRoute, /e\.activity_group AS "activityGroup"/);
  assert.doesNotMatch(exportsRoute, /activity_group_validation_status|activityGroupValidationStatus/);
  assert.doesNotMatch(exportsRoute, /privacy_review_status|privacyReviewStatus/);
  assert.match(exporter, /raterCanRate/);
  assert.match(exporter, /rubric_version/);
  assert.match(exporter, /skip_reason/);
  assert.match(exporter, /critical_failure_observed/);
  assert.match(exporter, /participant_behaviour_/);
  assert.match(exporter, /participant_reaction_/);
  assert.match(exporter, /episode_ending/);
  assert.match(exporter, /task_outcome/);
  assert.doesNotMatch(exporter, /"legacy_episode_end_reason"/);
  assert.doesNotMatch(exporter, /stopping_factor_/);
  assert.doesNotMatch(exporter, /participant_behaviour_\$\{behaviour\.key\}_message_turns/);
  assert.doesNotMatch(exporter, /participant_reaction_\$\{reaction\.key\}_message_turns/);
  assert.doesNotMatch(exporter, /\$\{dimension\.key\}_justification/);
  assert.match(exporter, /routing_na_reason/);
  assert.match(exporter, /gender_context_handling/);
  assert.match(exporter, /most_useful_thing/);
  assert.match(exporter, /suggested_improvement/);
  assert.match(exporter, /spreadsheet-formula prefixes/);
  assert.match(app, /Open export centre/);
});
