const PASSWORD_SCHEME = "pbkdf2-sha256";
const PASSWORD_ITERATIONS = 310_000;
const PASSWORD_KEY_BYTES = 32;
const SESSION_COOKIE = "najah_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function derivePasswordKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const sourceKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    sourceKey,
    PASSWORD_KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** Compare byte arrays without returning as soon as a mismatch is found. */
function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

/** Hash a rater password with a unique salt using Web Crypto's PBKDF2. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derivePasswordKey(password, salt, PASSWORD_ITERATIONS);
  return [
    PASSWORD_SCHEME,
    String(PASSWORD_ITERATIONS),
    bytesToBase64Url(salt),
    bytesToBase64Url(derived),
  ].join("$");
}

/** Verify a submitted password against the versioned password-hash string. */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [scheme, iterationsText, saltText, expectedText] = storedHash.split("$");
  const iterations = Number(iterationsText);
  if (
    scheme !== PASSWORD_SCHEME ||
    !Number.isSafeInteger(iterations) ||
    iterations < 100_000 ||
    !saltText ||
    !expectedText
  ) {
    return false;
  }
  try {
    const actual = await derivePasswordKey(password, base64UrlToBytes(saltText), iterations);
    return constantTimeEqual(actual, base64UrlToBytes(expectedText));
  } catch {
    return false;
  }
}

/** Return a user-facing password validation message, or null when acceptable. */
export function passwordValidationError(password: string): string | null {
  if (password.length < 12) return "Use at least 12 characters for your password.";
  if (password.length > 128) return "Password must be 128 characters or fewer.";
  return null;
}

/** Generate an unguessable session token. Only its digest is stored in D1. */
export function createSessionToken(): string {
  return bytesToBase64Url(randomBytes(32));
}

/** Produce a stable database key without persisting the bearer token itself. */
export async function digestSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return bytesToBase64Url(new Uint8Array(digest));
}

/** Compare an invitation code without leaking the first differing character. */
export async function secretsMatch(submitted: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(submitted)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return constantTimeEqual(new Uint8Array(left), new Uint8Array(right));
}

/** Read one cookie value from a request Cookie header. */
export function readSessionToken(cookieHeader: string | null): string | null {
  for (const part of (cookieHeader ?? "").split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}

export function sessionExpiryEpoch(): number {
  return Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function expiredSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
