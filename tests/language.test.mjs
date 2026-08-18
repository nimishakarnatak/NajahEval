import assert from "node:assert/strict";
import test from "node:test";

import { languageLabel, resolveEpisodeLanguage } from "../lib/language.ts";

test("formats Arabic and French code-switching", () => {
  const language = resolveEpisodeLanguage(
    "ar",
    "[TURN 001] USER: أريد العمل avec une équipe française",
  );
  assert.equal(languageLabel(language), "Arabic + French");
});

test("formats English and Arabic code-switching", () => {
  const language = resolveEpisodeLanguage(
    "en",
    "[TURN 001] USER: I want to prepare for this job وأحتاج نصائح للمقابلة",
  );
  assert.equal(languageLabel(language), "English + Arabic");
});

test("formats French and English code-switching", () => {
  const language = resolveEpisodeLanguage(
    "fr",
    "[TURN 001] USER: Je veux améliorer mon profil because I want this job",
  );
  assert.equal(languageLabel(language), "French + English");
});

test("keeps a single label when the participant does not code-switch", () => {
  const language = resolveEpisodeLanguage(
    "fr",
    "[TURN 001] USER: Je veux préparer mon entretien avec vous",
  );
  assert.equal(languageLabel(language), "French");
});

test("does not use Najah's reply to infer the participant language", () => {
  const language = resolveEpisodeLanguage(
    "ar",
    "[TURN 001] USER: أريد الاستعداد للمقابلة [TURN 002] NAJAH: I can help you prepare for the job interview",
  );
  assert.equal(languageLabel(language), "Arabic");
});

test("respects an explicit no-code-switching review", () => {
  const language = resolveEpisodeLanguage(
    "fr",
    "[TURN 001] USER: Je veux améliorer mon profil because I want this job",
    false,
  );
  assert.equal(languageLabel(language), "French");
});
