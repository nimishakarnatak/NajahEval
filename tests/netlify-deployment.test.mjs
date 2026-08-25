import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

test("uses standard Next.js and external Neon Postgres for a durable deployment", async () => {
  const [packageJson, netlify, database] = await Promise.all([
    readFile(projectFile("package.json"), "utf8"),
    readFile(projectFile("netlify.toml"), "utf8"),
    readFile(projectFile("db/index.ts"), "utf8"),
  ]);
  const manifest = JSON.parse(packageJson);

  assert.equal(manifest.scripts.build, "next build --webpack");
  assert.equal(manifest.dependencies.next, "16.2.6");
  assert.equal(manifest.dependencies["@neondatabase/serverless"], "1.1.0");
  assert.equal(manifest.dependencies["@netlify/database"], undefined);
  assert.equal(manifest.dependencies.vinext, undefined);
  assert.match(netlify, /publish = "\.next"/);
  assert.match(database, /import \{ neon \} from "@neondatabase\/serverless"/);
  assert.match(database, /process\.env\.DATABASE_URL/);
  assert.doesNotMatch(database, /cloudflare:workers/);
});

test("ships a versioned Postgres schema and traces the bundled dataset", async () => {
  const [migration, nextConfig, bundledDataset] = await Promise.all([
    readFile(
      projectFile("database/migrations/20260825000000_create_najah_schema.sql"),
      "utf8",
    ),
    readFile(projectFile("next.config.ts"), "utf8"),
    readFile(projectFile("lib/bundled-dataset.ts"), "utf8"),
  ]);

  for (const table of ["users", "auth_sessions", "episodes", "annotations", "rubric_annotations"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(nextConfig, /outputFileTracingIncludes/);
  assert.match(nextConfig, /najah_final_annotation_dataset\.csv/);
  assert.match(bundledDataset, /parameterized multi-row upsert/);
  assert.match(bundledDataset, /ON CONFLICT\(episode_id\) DO UPDATE/);
});
