import { ensureNajahSchema, getDatabase } from "@/db";
import {
  digestSessionToken,
  expiredSessionCookie,
  readSessionToken,
} from "@/lib/password-auth";

export async function POST(request: Request) {
  const token = readSessionToken(request.headers.get("cookie"));
  if (token) {
    const db = getDatabase();
    await ensureNajahSchema(db);
    await db
      .prepare("DELETE FROM auth_sessions WHERE session_hash = ?")
      .bind(await digestSessionToken(token))
      .run();
  }
  return Response.json(
    { ok: true },
    { headers: { "set-cookie": expiredSessionCookie() } },
  );
}
