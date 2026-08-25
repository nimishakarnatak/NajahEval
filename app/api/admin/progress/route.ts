import { getAdminProgress } from "@/lib/admin-progress";
import { getRaterIdentity } from "@/lib/server-auth";

/**
 * Returns aggregate progress only to signed-in administrator accounts.
 * Evaluator identities and activity metadata are never exposed through the
 * public review queue or to ordinary rater sessions.
 */
export async function GET(request: Request) {
  const rater = await getRaterIdentity(request);
  if (!rater) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }
  if (rater.role !== "admin") {
    return Response.json(
      { error: "Administrator access is required." },
      { status: 403 },
    );
  }

  return Response.json(await getAdminProgress());
}
