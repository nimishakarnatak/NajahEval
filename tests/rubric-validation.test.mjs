import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rubricPath = new URL("../lib/rubric.ts", import.meta.url);
const annotatorAppPath = new URL("../app/AnnotatorApp.tsx", import.meta.url);
const annotationRoutePath = new URL("../app/api/annotations/route.ts", import.meta.url);
const episodeRoutePath = new URL("../app/api/episodes/route.ts", import.meta.url);
const schemaPath = new URL(
  "../database/migrations/20260825000000_create_najah_schema.sql",
  import.meta.url,
);

test("defines all nine evidence-based dimensions and seven critical-failure categories", async () => {
  const rubric = await readFile(rubricPath, "utf8");
  for (const dimension of [
    "contextualAppropriateness",
    "factualAccuracy",
    "safety",
    "scope",
    "routing",
    "taskEffectiveness",
    "continuity",
    "responsibleGuidance",
    "communication",
  ]) {
    assert.match(rubric, new RegExp(`"${dimension}"`));
  }
  for (const flag of [
    "fabrication",
    "unsafeAdvice",
    "privacyViolation",
    "stereotypingDiscrimination",
    "missingEscalation",
    "manipulativeAuthority",
    "otherSeriousFailure",
  ]) {
    assert.match(rubric, new RegExp(`"${flag}"`));
  }
});

test("includes every revised participant, ending, stopping, gender, and qualitative field", async () => {
  const [rubric, app, route, schema] = await Promise.all([
    readFile(rubricPath, "utf8"),
    readFile(annotatorAppPath, "utf8"),
    readFile(annotationRoutePath, "utf8"),
    readFile(schemaPath, "utf8"),
  ]);
  for (const key of [
    "providedRequestedInformation",
    "attemptedRequestedAction",
    "usedOrRespondedToOutput",
    "askedFollowUpQuestion",
    "correctedOrDisagreed",
    "expressedSatisfaction",
    "expressedConfusionOrFrustration",
    "changedModule",
    "noFurtherReply",
    "noClearResponse",
    "cannotDetermine",
    "otherObservableResponse",
  ]) assert.match(rubric, new RegExp(`"${key}"`));
  assert.match(rubric, /The intended output or outcome was delivered/);
  assert.match(rubric, /Repetition or loss of context/);
  assert.match(rubric, /Request for sensitive personal information/);
  assert.match(rubric, /Gender-related guidance was restrictive/);
  assert.match(app, /most useful thing Najah did/);
  assert.match(app, /done or said differently/);
  for (const column of [
    "participant_responses_json",
    "participant_response_other",
    "module_episode_ending",
    "stopping_factors_json",
    "stopping_factors_evidence_turns",
    "stopping_factors_explanation",
    "gender_context_handling",
    "most_useful_thing",
    "suggested_improvement",
    "critical_evidence_turns_json",
  ]) {
    assert.match(schema, new RegExp(column));
    assert.match(route, new RegExp(column));
  }
});

test("uses observable, layered scope guidance without the old compound anchor", async () => {
  const [rubric, app] = await Promise.all([
    readFile(rubricPath, "utf8"),
    readFile(annotatorAppPath, "utf8"),
  ]);
  assert.match(rubric, /Does Najah stay within the role of career guidance/);
  assert.match(rubric, /Within scope/);
  assert.match(rubric, /Minor boundary issue/);
  assert.match(rubric, /Outside scope/);
  assert.match(app, /Illustrative examples—not exhaustive/);
  assert.match(rubric, /Discussing gender-related barriers is within scope/);
  assert.doesNotMatch(rubric, /presents inappropriate authority/);
});

test("keeps routine score notes optional and validates the revised categorical questions", async () => {
  const route = await readFile(annotationRoutePath, "utf8");
  assert.doesNotMatch(route, /Add the relevant turn number\(s\)/);
  assert.doesNotMatch(route, /Provide a written justification for/);
  assert.doesNotMatch(route, /if \(!annotation\.justifications\[dimension\.key\]\)/);
  assert.match(route, /Select the task status/);
  assert.match(route, /Select at least one observable participant response/);
  assert.match(route, /Select how the available module episode ended/);
  assert.match(route, /Select how gender-related context was handled/);
  assert.match(route, /Provide the evidence turn number\(s\) for the stopping factor/);
  assert.doesNotMatch(route, /received a score of/);
  assert.doesNotMatch(route, /genuinely cannot be assessed/);
  assert.match(route, /Select whether any critical failure was observed/);
  assert.match(route, /Select at least one critical-failure category/);
  assert.match(route, /Provide a brief explanation/);
});

test("permanently deletes only the signed-in rater's selected drafts", async () => {
  const route = await readFile(annotationRoutePath, "utf8");
  assert.match(route, /export async function DELETE/);
  assert.match(route, /Rater status is required to delete drafts/);
  assert.match(route, /WHERE rater_id = \?/);
  assert.match(route, /AND status = 'draft'/);
  assert.match(route, /WHERE import_batch = \?/);
  assert.match(route, /RETURNING episode_id AS "episodeId"/);
  assert.match(route, /deletedEpisodeIds/);
});

test("keeps evidence-rubric results separate from legacy pilot annotations", async () => {
  const [episodeRoute, schema] = await Promise.all([
    readFile(episodeRoutePath, "utf8"),
    readFile(schemaPath, "utf8"),
  ]);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS rubric_annotations/);
  assert.match(schema, /task_status TEXT NOT NULL DEFAULT ''/);
  assert.match(schema, /task_incomplete_reason TEXT NOT NULL DEFAULT ''/);
  assert.match(schema, /skip_reason TEXT NOT NULL DEFAULT ''/);
  assert.match(schema, /critical_failure_observed TEXT NOT NULL DEFAULT ''/);
  assert.match(schema, /participant_responses_json TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(schema, /module_episode_ending TEXT NOT NULL DEFAULT ''/);
  assert.match(schema, /stopping_factors_json TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(schema, /gender_context_handling TEXT NOT NULL DEFAULT ''/);
  assert.match(schema, /most_useful_thing TEXT NOT NULL DEFAULT ''/);
  assert.match(schema, /suggested_improvement TEXT NOT NULL DEFAULT ''/);
  assert.match(episodeRoute, /FROM rubric_annotations completed/);
  assert.match(episodeRoute, /LEFT JOIN rubric_annotations current/);
});
