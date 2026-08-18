import assert from "node:assert/strict";
import test from "node:test";

import {
  createSessionToken,
  digestSessionToken,
  expiredSessionCookie,
  hashPassword,
  passwordValidationError,
  readSessionToken,
  secretsMatch,
  sessionCookie,
  verifyPassword,
} from "../lib/password-auth.ts";

test("hashes passwords with unique salts and verifies the correct password", async () => {
  const first = await hashPassword("a long example password");
  const second = await hashPassword("a long example password");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("a long example password", first), true);
  assert.equal(await verifyPassword("the wrong password", first), false);
});

test("requires a twelve-character password", () => {
  assert.match(passwordValidationError("too-short") ?? "", /at least 12/i);
  assert.equal(passwordValidationError("long enough password"), null);
});

test("creates opaque sessions and stores only a stable digest", async () => {
  const token = createSessionToken();
  assert.ok(token.length >= 40);
  assert.notEqual(await digestSessionToken(token), token);
  assert.equal(await digestSessionToken(token), await digestSessionToken(token));
});

test("sets and clears a secure HttpOnly session cookie", () => {
  const token = createSessionToken();
  const cookie = sessionCookie(token);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(readSessionToken(cookie), token);
  assert.match(expiredSessionCookie(), /Max-Age=0/);
});

test("compares invitation codes without partial string checks", async () => {
  assert.equal(await secretsMatch("team-code", "team-code"), true);
  assert.equal(await secretsMatch("team-codf", "team-code"), false);
});
