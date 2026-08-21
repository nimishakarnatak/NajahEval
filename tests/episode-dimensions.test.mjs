import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeStudentStatus,
  normalizeTreatment,
  studentStatusLabel,
  treatmentLabel,
} from "../lib/episode-dimensions.ts";

test("maps current Najah participant groups to student status", () => {
  assert.equal(normalizeStudentStatus("group1, gender-sensitive"), "current_student");
  assert.equal(normalizeStudentStatus("group2"), "graduated_student");
  assert.equal(normalizeStudentStatus("Current student"), "current_student");
  assert.equal(normalizeStudentStatus("Graduated student"), "graduated_student");
  assert.equal(normalizeStudentStatus(""), "unknown");
});

test("maps the two treatment assignments without substring collisions", () => {
  assert.equal(normalizeTreatment("not-gender-sensitive"), "standard");
  assert.equal(normalizeTreatment("Standard"), "standard");
  assert.equal(normalizeTreatment("gender-sensitive"), "gender_sensitive");
  assert.equal(normalizeTreatment(""), "unknown");
});

test("formats annotator-facing dimension labels", () => {
  assert.equal(studentStatusLabel("graduated_student"), "Graduated student");
  assert.equal(studentStatusLabel("current_student"), "Current student");
  assert.equal(treatmentLabel("standard"), "Standard");
  assert.equal(treatmentLabel("gender_sensitive"), "Gender-sensitive");
});
