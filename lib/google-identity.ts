const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const CLOCK_SKEW_SECONDS = 5 * 60;

type JwtHeader = {
  alg?: string;
  kid?: string;
  typ?: string;
};

type GoogleClaims = {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
};

export type VerifiedGoogleIdentity = {
  subject: string;
  email: string;
  displayName: string;
};

type GoogleJwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

let cachedKeys: GoogleJwk[] = [];
let keysExpireAt = 0;

/** Decode a base64url JWT segment without relying on Node-only APIs. */
function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parseJwtJson<T>(segment: string): T {
  const text = new TextDecoder().decode(decodeBase64Url(segment));
  return JSON.parse(text) as T;
}

function cacheLifetimeSeconds(cacheControl: string | null): number {
  const match = cacheControl?.match(/(?:^|,)\s*max-age=(\d+)/i);
  const seconds = Number(match?.[1] ?? 3600);
  return Number.isFinite(seconds) ? Math.min(Math.max(seconds, 300), 21_600) : 3600;
}

/** Download and briefly cache Google's rotating public signing keys. */
async function getGoogleSigningKeys(forceRefresh = false): Promise<GoogleJwk[]> {
  if (!forceRefresh && cachedKeys.length && Date.now() < keysExpireAt) return cachedKeys;
  const response = await fetch(GOOGLE_JWKS_URL);
  if (!response.ok) throw new Error("Google's sign-in keys are temporarily unavailable.");
  const payload = (await response.json()) as { keys?: GoogleJwk[] };
  if (!Array.isArray(payload.keys) || payload.keys.length === 0) {
    throw new Error("Google returned an invalid sign-in key set.");
  }
  cachedKeys = payload.keys;
  keysExpireAt = Date.now() + cacheLifetimeSeconds(response.headers.get("cache-control")) * 1000;
  return cachedKeys;
}

async function findSigningKey(keyId: string): Promise<GoogleJwk> {
  let keys = await getGoogleSigningKeys();
  let key = keys.find((candidate) => candidate.kid === keyId);
  // Google rotates keys. Refresh once when a token names a key not in cache.
  if (!key) {
    keys = await getGoogleSigningKeys(true);
    key = keys.find((candidate) => candidate.kid === keyId);
  }
  if (!key) throw new Error("Google used an unknown sign-in key.");
  return key;
}

function audienceMatches(audience: string | string[] | undefined, clientId: string): boolean {
  return typeof audience === "string"
    ? audience === clientId
    : Array.isArray(audience) && audience.includes(clientId);
}

/**
 * Verify a Google Identity Services ID token and return only trusted identity
 * fields. Signature, issuer, audience, expiry, and verified-email checks all
 * happen before the profile is used to create an application session.
 */
export async function verifyGoogleIdToken(
  token: string,
  clientId: string,
): Promise<VerifiedGoogleIdentity> {
  const segments = token.split(".");
  if (segments.length !== 3 || token.length > 20_000) {
    throw new Error("Google returned an invalid sign-in credential.");
  }

  let header: JwtHeader;
  let claims: GoogleClaims;
  try {
    header = parseJwtJson<JwtHeader>(segments[0]);
    claims = parseJwtJson<GoogleClaims>(segments[1]);
  } catch {
    throw new Error("Google returned an unreadable sign-in credential.");
  }
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Google returned an unsupported sign-in credential.");
  }

  const jwk = await findSigningKey(header.kid);
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signatureValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    decodeBase64Url(segments[2]),
    new TextEncoder().encode(`${segments[0]}.${segments[1]}`),
  );
  if (!signatureValid) throw new Error("Google could not verify this sign-in.");

  const now = Math.floor(Date.now() / 1000);
  if (!claims.iss || !GOOGLE_ISSUERS.has(claims.iss)) {
    throw new Error("This credential was not issued by Google.");
  }
  if (!audienceMatches(claims.aud, clientId)) {
    throw new Error("This Google sign-in belongs to a different application.");
  }
  if (!claims.exp || claims.exp <= now - CLOCK_SKEW_SECONDS) {
    throw new Error("The Google sign-in credential has expired.");
  }
  if (claims.iat && claims.iat > now + CLOCK_SKEW_SECONDS) {
    throw new Error("The Google sign-in credential is not valid yet.");
  }
  if (claims.nbf && claims.nbf > now + CLOCK_SKEW_SECONDS) {
    throw new Error("The Google sign-in credential is not valid yet.");
  }
  if (!claims.sub || claims.sub.length > 255) {
    throw new Error("Google did not provide a valid account identifier.");
  }
  const email = (claims.email ?? "").trim().toLowerCase();
  if (claims.email_verified !== true || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Google did not provide a verified email address.");
  }
  const displayName = (claims.name ?? [claims.given_name, claims.family_name].filter(Boolean).join(" "))
    .trim()
    .slice(0, 80) || email.split("@")[0];

  return { subject: claims.sub, email, displayName };
}
