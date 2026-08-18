import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("../app/page.tsx", import.meta.url);
const layoutPath = new URL("../app/layout.tsx", import.meta.url);
const componentPath = new URL("../app/AnnotatorApp.tsx", import.meta.url);
const importRoutePath = new URL("../app/api/episodes/import/route.ts", import.meta.url);

test("ships Najah-specific metadata without starter preview markers", async () => {
  const [page, layout] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(layoutPath, "utf8"),
  ]);
  assert.match(page, /Najah Review Studio/);
  assert.match(layout, /og\.png/);
  assert.doesNotMatch(`${page}\n${layout}`, /codex-preview|SkeletonPreview/);
});

test("includes the core annotation workflow without the temporary do-not-release gate", async () => {
  const [component, importRoute] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(importRoutePath, "utf8"),
  ]);
  assert.match(component, /Task achievement/);
  assert.match(component, /Submit & next/);
  assert.match(component, /Import approved CSV/);
  assert.doesNotMatch(`${component}\n${importRoute}`, /do_not_release|doNotRelease/);
});
