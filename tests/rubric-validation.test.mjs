import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rubricPath = new URL("../lib/rubric.ts", import.meta.url);
const annotationRoutePath = new URL("../app/api/annotations/route.ts", import.meta.url);
const episodeRoutePath = new URL("../app/api/episodes/route.ts", import.meta.url);
const schemaPath = new URL("../db/index.ts", import.meta.url);

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

test("enforces evidence, episode ending, and Yes/No flags without requiring score justifications", async () => {
  const route = await readFile(annotationRoutePath, "utf8");
  assert.match(route, /Add the relevant turn number\(s\)/);
  assert.match(route, /Select why the observed module episode ended/);
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
  assert.match(episodeRoute, /FROM rubric_annotations completed/);
  assert.match(episodeRoute, /LEFT JOIN rubric_annotations current/);
});
