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
const bundledDatasetPath = new URL("../lib/bundled-dataset.ts", import.meta.url);
const datasetCsvPath = new URL("../data/najah_final_annotation_dataset.csv", import.meta.url);
const episodesRoutePath = new URL("../app/api/episodes/route.ts", import.meta.url);
const dimensionsPath = new URL("../lib/episode-dimensions.ts", import.meta.url);
const rubricPath = new URL("../lib/rubric.ts", import.meta.url);
const importRoutePath = new URL("../app/api/episodes/import/route.ts", import.meta.url);
const registerRoutePath = new URL("../app/api/auth/register/route.ts", import.meta.url);
const googleRoutePath = new URL("../app/api/auth/google/route.ts", import.meta.url);
const googleIdentityPath = new URL("../lib/google-identity.ts", import.meta.url);

test("ships Najah-specific metadata without starter preview markers", async () => {
  const [page, layout] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(layoutPath, "utf8"),
  ]);
  assert.match(page, /Najah Review Studio/);
  assert.match(layout, /og\.png/);
  assert.doesNotMatch(`${page}\n${layout}`, /codex-preview|SkeletonPreview/);
});

test("classifies code-switched conversations while keeping language labels out of the review UI", async () => {
  const [component, language, episodesRoute] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(languagePath, "utf8"),
    readFile(episodesRoutePath, "utf8"),
  ]);
  assert.doesNotMatch(component, /languageLabel\(current\.language\)/);
  assert.match(episodesRoute, /resolveEpisodeLanguage/);
  assert.match(language, /join\(" \+ "\)/);
  assert.match(language, /participant turns/);
  assert.match(language, /arabicCharacters >= 12/);
  assert.match(language, /frenchScore >= 3/);
  assert.match(language, /englishScore >= 3/);
});

test("filters the review queue by the requested three analysis dimensions", async () => {
  const [component, dimensions, bundledDataset] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(dimensionsPath, "utf8"),
    readFile(bundledDatasetPath, "utf8"),
  ]);
  assert.match(component, /Student status/);
  assert.match(component, /Module/);
  assert.match(component, /Treatment assignment/);
  assert.match(component, /student_status/);
  assert.doesNotMatch(component, /All languages/);
  assert.match(dimensions, /Graduated student/);
  assert.match(dimensions, /Current student/);
  assert.match(dimensions, /Gender-sensitive/);
  assert.match(bundledDataset, /student_status/);
  assert.match(bundledDataset, /treatment/);
});

test("bundles and automatically seeds the 300-episode final dataset", async () => {
  const [component, bundledDataset, datasetCsv, episodesRoute] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(bundledDatasetPath, "utf8"),
    readFile(datasetCsvPath, "utf8"),
    readFile(episodesRoutePath, "utf8"),
  ]);
  assert.equal((datasetCsv.match(/^\d+,E\d+,/gm) ?? []).length, 300);
  assert.match(datasetCsv, /^rater_item_order,episode_id,student_status,language,module,treatment,/);
  assert.doesNotMatch(datasetCsv.split("\n", 1)[0], /activity/);
  assert.match(bundledDataset, /BUNDLED_EPISODE_COUNT/);
  assert.match(bundledDataset, /ON CONFLICT\(episode_id\) DO UPDATE/);
  assert.match(episodesRoute, /ensureBundledDataset\(db\)/);
  assert.match(component, /reviewed episodes are built in and shared with every rater/);
  assert.doesNotMatch(component, /Import CSV/);
});

test("opens a personal progress list with direct episode navigation", async () => {
  const component = await readFile(componentPath, "utf8");
  assert.match(component, /aria-haspopup="dialog"/);
  assert.match(component, /Review progress/);
  assert.match(component, /Completed by you/);
  assert.match(component, /In progress/);
  assert.match(component, /Not yet started/);
  assert.match(component, /openEpisodeFromProgress/);
  assert.match(component, /openViewList/);
  assert.match(component, /viewCounts\[view\]/);
  assert.match(component, /progressView === "queue"/);
  assert.match(component, /progressView === "all"/);
  assert.match(component, /No drafts yet/);
  assert.match(component, /No completed episodes yet/);
  assert.match(component, /Select any episode to open it in the evaluation workspace/);
});

test("uses queue and progress lists instead of a conflicting episode search", async () => {
  const component = await readFile(componentPath, "utf8");
  assert.doesNotMatch(component, /Find an episode/);
  assert.doesNotMatch(component, /episodeSearchRank|openEpisodeFromSearch/);
  assert.match(component, /My queue/);
  assert.match(component, /Drafts/);
  assert.match(component, /Completed/);
  assert.match(component, /openEpisodeFromProgress/);
});

test("separates flattened transcripts into legible participant and Najah turns", async () => {
  const [component, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /transcript\.matchAll\(turnMarker\)/);
  assert.match(component, /messageEnd = matches\[index \+ 1\]\?\.index/);
  assert.match(styles, /\.najah-turn \{[^}]*margin-bottom: 11px/);
  assert.match(styles, /\.transcript \{[^}]*gap: 17px/);
});

test("offers a browser-local English translation toggle without replacing originals", async () => {
  const [component, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /English translation/);
  assert.match(component, /globalThis[\s\S]*Translator\?: BrowserTranslatorFactory/);
  assert.match(component, /targetLanguage: "en"/);
  assert.match(component, /setTranscriptView\("original"\)/);
  assert.match(component, /Machine translation for reading support/);
  assert.match(component, /turn numbers are unchanged/);
  assert.match(styles, /\.translation-view-options/);
  assert.match(styles, /\.translation-progress/);
});

test("includes the core annotation workflow without temporary release or review gates", async () => {
  const [component, rubric, importRoute] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(rubricPath, "utf8"),
    readFile(importRoutePath, "utf8"),
  ]);
  assert.match(rubric, /Contextual appropriateness/);
  assert.match(rubric, /Task effectiveness/);
  assert.match(component, /Evidence turn number\(s\)/);
  assert.match(component, /Critical-failure flags/);
  assert.match(component, /Evidence turn numbers and written score justifications are optional/);
  assert.match(component, /Task status/);
  assert.match(component, /Why was the task not completed/);
  assert.match(rubric, /No further participant reply was observed/);
  assert.match(rubric, /Output delivered, but not acknowledged/);
  assert.match(rubric, /The available conversation does not provide enough evidence/);
  assert.match(rubric, /Cannot determine/);
  assert.match(component, /Submit & next/);
  assert.match(component, /reviewed episodes are built in/);
  assert.doesNotMatch(`${component}\n${importRoute}`, /do_not_release|doNotRelease/);
  assert.doesNotMatch(
    importRoute,
    /releaseEligible !== true|privacyReviewStatus !== "approved"|languageReviewStatus === "pending_manual_review"/,
  );
});

test("separates task status from the conditional reason an incomplete task stopped", async () => {
  const [component, rubric, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(rubricPath, "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(rubric, /najah-evidence-v7/);
  assert.match(rubric, /Completed and acknowledged/);
  assert.match(rubric, /Participant moved to another module/);
  assert.match(rubric, /No further Najah reply was observed/);
  assert.match(rubric, /Najah response-quality/);
  assert.match(rubric, /Whole module-episode/);
  assert.match(component, /Assess the quality of Najah’s responses in this episode/);
  assert.match(component, /Give one score per dimension for the complete module episode/);
  assert.match(component, /status === "not_completed"/);
  assert.match(styles, /\.episode-end-options label \{[^}]*grid-template-columns: 16px minmax\(0, 1fr\)/);
  assert.match(styles, /\.episode-end-options input \{[^}]*width: 16px; height: 16px/);
});

test("keeps submission validation visible and reveals the first incomplete field", async () => {
  const [component, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /firstSubmissionProblem/);
  assert.match(component, /Rating not submitted/);
  assert.match(component, /role="alert"/);
  assert.match(component, /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
  assert.match(component, /id=\{`evidence-\$\{dimension\.key\}`\}/);
  assert.match(component, /id="task-status"/);
  assert.match(component, /id="task-incomplete-reason"/);
  assert.match(styles, /\.submit-error/);
  assert.match(styles, /\.score-card:focus-within/);
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

test("offers Google sign-in without depending on a ChatGPT account", async () => {
  const [authScreen, page, googleRoute, googleIdentity] = await Promise.all([
    readFile(authScreenPath, "utf8"),
    readFile(pagePath, "utf8"),
    readFile(googleRoutePath, "utf8"),
    readFile(googleIdentityPath, "utf8"),
  ]);
  assert.match(authScreen, /Continue with Google/);
  assert.match(authScreen, /no ChatGPT account is required/);
  assert.match(authScreen, /accounts\.google\.com\/gsi\/client/);
  assert.match(page, /GOOGLE_CLIENT_ID/);
  assert.match(googleRoute, /verifyGoogleIdToken/);
  assert.match(googleRoute, /UPDATE rubric_annotations SET rater_id/);
  assert.match(googleIdentity, /RSASSA-PKCS1-v1_5/);
  assert.match(googleIdentity, /GOOGLE_ISSUERS/);
  assert.match(googleIdentity, /audienceMatches/);
  assert.match(googleIdentity, /email_verified !== true/);
});
