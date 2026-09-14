import assert from "node:assert/strict";
import test from "node:test";

import { acceptsSameOriginMutation } from "../lib/request-security.ts";

test("accepts the public Netlify origin when the internal request URL is rewritten", () => {
  const request = new Request("https://internal-handler.invalid/api/auth/forgot-password", {
    headers: {
      host: "internal-handler.invalid",
      origin: "https://najah-eval.netlify.app",
      "x-forwarded-host": "najah-eval.netlify.app",
      "x-najah-auth": "password-reset",
    },
  });
  assert.equal(acceptsSameOriginMutation(request, "password-reset"), true);
});

test("rejects cross-origin and incorrectly labelled authentication mutations", () => {
  const crossOrigin = new Request("https://najah-eval.netlify.app/api/auth/reset-password", {
    headers: {
      origin: "https://attacker.invalid",
      "x-najah-auth": "password-reset",
    },
  });
  const wrongAction = new Request("https://najah-eval.netlify.app/api/auth/reset-password", {
    headers: {
      origin: "https://najah-eval.netlify.app",
      "x-najah-auth": "google",
    },
  });
  assert.equal(acceptsSameOriginMutation(crossOrigin, "password-reset"), false);
  assert.equal(acceptsSameOriginMutation(wrongAction, "password-reset"), false);
});
