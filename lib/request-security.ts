/** Return the first proxy header value when multiple hops are listed. */
function firstHeaderValue(value: string | null): string {
  return (value ?? "").split(",", 1)[0].trim().toLowerCase();
}

/**
 * Verify that a browser mutation came from this site and names the expected
 * action. Netlify can rewrite `request.url` to an internal function address,
 * so public forwarded/host headers are also accepted as the expected host.
 */
export function acceptsSameOriginMutation(request: Request, action: string): boolean {
  if (request.headers.get("x-najah-auth") !== action) return false;

  const originText = request.headers.get("origin");
  if (!originText) return false;

  let origin: URL;
  let requestUrl: URL;
  try {
    origin = new URL(originText);
    requestUrl = new URL(request.url);
  } catch {
    return false;
  }

  const allowedHosts = new Set(
    [
      requestUrl.host.toLowerCase(),
      firstHeaderValue(request.headers.get("x-forwarded-host")),
      firstHeaderValue(request.headers.get("host")),
    ].filter(Boolean),
  );
  const secureOrigin =
    origin.protocol === "https:" || origin.hostname === "localhost" || origin.hostname === "127.0.0.1";
  return secureOrigin && allowedHosts.has(origin.host.toLowerCase());
}
