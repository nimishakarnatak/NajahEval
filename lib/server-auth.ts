import { headers } from "next/headers";

import { ensureNajahSchema, getD1 } from "@/db";
import { digestSessionToken, readSessionToken } from "@/lib/password-auth";

export type RaterIdentity = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "rater";
};

function hostnameFromHeaders(requestHeaders: Headers): string {
  return (requestHeaders.get("host") ?? "").split(":")[0].toLowerCase();
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Resolve the signed-in rater from the secure, server-side session cookie. */
export async function getRaterIdentity(request?: Request): Promise<RaterIdentity | null> {
  const requestHeaders = request?.headers ?? (await headers());
  const hostname = request
    ? new URL(request.url).hostname
    : hostnameFromHeaders(requestHeaders);

  // Local preview remains usable without creating a production account.
  if (isLocalHostname(hostname)) {
    return {
      id: requestHeaders.get("x-local-rater-id") || "local-preview-rater",
      email: "local-preview@najah.invalid",
      displayName: "Local preview",
      role: "admin",
    };
  }

  const token = readSessionToken(requestHeaders.get("cookie"));
  if (!token) return null;

  const db = getD1();
  await ensureNajahSchema(db);
  const tokenHash = await digestSessionToken(token);
  const now = Math.floor(Date.now() / 1000);
  const user = await db
    .prepare(`
      SELECT
        users.user_id AS id,
        users.email,
        users.display_name AS displayName,
        users.role
      FROM auth_sessions
      INNER JOIN users ON users.user_id = auth_sessions.user_id
      WHERE auth_sessions.session_hash = ?
        AND auth_sessions.expires_at > ?
      LIMIT 1
    `)
    .bind(tokenHash, now)
    .first<RaterIdentity>();

  return user ?? null;
}
