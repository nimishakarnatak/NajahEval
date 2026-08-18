import { getChatGPTUser } from "@/app/chatgpt-auth";

export type RaterIdentity = {
  id: string;
  email: string;
  displayName: string;
};

export async function getRaterIdentity(
  request?: Request,
): Promise<RaterIdentity | null> {
  const user = await getChatGPTUser();
  if (user) {
    return {
      id: user.userId,
      email: user.email,
      displayName: user.displayName,
    };
  }

  if (request) {
    const hostname = new URL(request.url).hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return {
        id: request.headers.get("x-local-rater-id") || "local-preview-rater",
        email: "local-preview@najah.invalid",
        displayName: "Local preview",
      };
    }
  }
  return null;
}
