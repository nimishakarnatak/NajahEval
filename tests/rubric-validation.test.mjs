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

test("defines all nine evidence-based dimensions and six critical flags", async () => {
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
  ]) {
    assert.match(rubric, new RegExp(`"${flag}"`));
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

test("keeps score evidence optional while enforcing task status and critical flags", async () => {
  const route = await readFile(annotationRoutePath, "utf8");
  assert.doesNotMatch(route, /Add the relevant turn number\(s\)/);
  assert.match(route, /Select the task status/);
  assert.match(route, /Select why the task was not completed/);
  assert.match(route, /annotation\.taskStatus === "not_completed"/);
  assert.doesNotMatch(route, /received a score of/);
  assert.doesNotMatch(route, /genuinely cannot be assessed/);
  assert.match(route, /Select Yes or No/);
  assert.match(route, /Provide turn evidence and an explanation/);
});

test("keeps evidence-rubric results separate from legacy pilot annotations", async () => {
  const [episodeRoute, schema] = await Promise.all([
    readFile(episodeRoutePath, "utf8"),
    readFile(schemaPath, "utf8"),
  ]);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS rubric_annotations/);
  assert.match(schema, /task_status TEXT NOT NULL DEFAULT ''/);
  assert.match(schema, /task_incomplete_reason TEXT NOT NULL DEFAULT ''/);
  assert.match(episodeRoute, /FROM rubric_annotations completed/);
  assert.match(episodeRoute, /LEFT JOIN rubric_annotations current/);
});
