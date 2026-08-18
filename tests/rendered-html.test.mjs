import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("../app/page.tsx", import.meta.url);
const layoutPath = new URL("../app/layout.tsx", import.meta.url);
const componentPath = new URL("../app/AnnotatorApp.tsx", import.meta.url);
const authScreenPath = new URL("../app/AuthScreen.tsx", import.meta.url);
const serverAuthPath = new URL("../lib/server-auth.ts", import.meta.url);
const passwordAuthPath = new URL("../lib/password-auth.ts", import.meta.url);
const languagePath = new URL("../lib/language.ts", import.meta.url);
const importRoutePath = new URL("../app/api/episodes/import/route.ts", import.meta.url);
const registerRoutePath = new URL("../app/api/auth/register/route.ts", import.meta.url);

test("ships Najah-specific metadata without starter preview markers", async () => {
  const [page, layout] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(layoutPath, "utf8"),
  ]);
  assert.match(page, /Najah Review Studio/);
  assert.match(layout, /og\.png/);
  assert.doesNotMatch(`${page}\n${layout}`, /codex-preview|SkeletonPreview/);
});

test("shows every detected language for code-switched conversations", async () => {
  const [component, language] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(languagePath, "utf8"),
  ]);
  assert.match(component, /languageLabel\(current\.language\)/);
  assert.match(component, /code_switching_detected/);
  assert.match(language, /join\(" \+ "\)/);
  assert.match(language, /participant turns/);
  assert.match(language, /arabicCharacters >= 12/);
  assert.match(language, /frenchScore >= 3/);
  assert.match(language, /englishScore >= 3/);
});

test("includes the core annotation workflow without temporary release or review gates", async () => {
  const [component, importRoute] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(importRoutePath, "utf8"),
  ]);
  assert.match(component, /Task achievement/);
  assert.match(component, /Submit & next/);
  assert.match(component, /Import CSV/);
  assert.doesNotMatch(`${component}\n${importRoute}`, /do_not_release|doNotRelease/);
  assert.doesNotMatch(
    importRoute,
    /releaseEligible !== true|privacyReviewStatus !== "approved"|languageReviewStatus === "pending_manual_review"/,
  );
});

test("provides open account creation and independent server sessions", async () => {
  const [authScreen, serverAuth, passwordAuth, importRoute, registerRoute] = await Promise.all([
    readFile(authScreenPath, "utf8"),
    readFile(serverAuthPath, "utf8"),
    readFile(passwordAuthPath, "utf8"),
    readFile(importRoutePath, "utf8"),
    readFile(registerRoutePath, "utf8"),
  ]);
  assert.match(authScreen, /Create account/);
  assert.match(authScreen, /At least 6 characters/);
  assert.doesNotMatch(`${authScreen}\n${registerRoute}`, /invitation code|invitationCode|MAX_RATER_ACCOUNTS/);
  assert.match(serverAuth, /auth_sessions/);
  assert.match(serverAuth, /readSessionToken/);
  assert.match(passwordAuth, /PASSWORD_ITERATIONS = 100_000/);
  assert.match(authScreen, /response\.text\(\)/);
  assert.doesNotMatch(authScreen, /response\.json\(\)/);
  assert.doesNotMatch(serverAuth, /getChatGPTUser/);
  assert.match(importRoute, /rater\.role !== "admin"/);
});
