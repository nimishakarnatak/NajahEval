import { createSessionToken, digestSessionToken } from "@/lib/password-auth";

export const PASSWORD_RESET_EXPIRY_SECONDS = 30 * 60;
export const PASSWORD_RESET_COOLDOWN_SECONDS = 60;
export const PASSWORD_RESET_GENERIC_MESSAGE =
  "If an active password account exists for that email, a reset link has been sent.";

export type PasswordResetEmailConfiguration = {
  apiKey: string;
  from: string;
};

/** Return the server-only email settings, or null until an administrator configures them. */
export function passwordResetEmailConfiguration(): PasswordResetEmailConfiguration | null {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.PASSWORD_RESET_FROM_EMAIL ?? "").trim();
  return apiKey && from ? { apiKey, from } : null;
}

/** Generate an unguessable bearer token. Only its digest is written to the database. */
export function createPasswordResetToken(): string {
  return createSessionToken();
}

/** Produce the one-way database key for a password-reset bearer token. */
export function digestPasswordResetToken(token: string): Promise<string> {
  return digestSessionToken(token);
}

/** Return the expiry time for a newly issued reset link as Unix seconds. */
export function passwordResetExpiryEpoch(now = Math.floor(Date.now() / 1000)): number {
  return now + PASSWORD_RESET_EXPIRY_SECONDS;
}

/** Escape database-backed display text before placing it in a transactional email. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Send a single password-reset email through Resend's HTTPS API.
 *
 * The raw reset token appears only in the email URL. The API key remains on
 * the server, and the idempotency key prevents an accidental retry from
 * delivering duplicate messages.
 */
export async function sendPasswordResetEmail(options: {
  configuration: PasswordResetEmailConfiguration;
  displayName: string;
  email: string;
  resetUrl: string;
  tokenHash: string;
}): Promise<void> {
  const safeName = escapeHtml(options.displayName || "Najah evaluator");
  const safeUrl = escapeHtml(options.resetUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.configuration.apiKey}`,
      "content-type": "application/json",
      "idempotency-key": `najah-password-reset-${options.tokenHash}`,
    },
    body: JSON.stringify({
      from: options.configuration.from,
      to: [options.email],
      subject: "Reset your Najah Review Studio password",
      text: [
        `Hello ${options.displayName || "Najah evaluator"},`,
        "",
        "Use this secure link to choose a new password:",
        options.resetUrl,
        "",
        "The link expires in 30 minutes and can be used only once.",
        "If you did not request this change, you can ignore this email.",
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;color:#17211e;line-height:1.6;max-width:560px">
          <p>Hello ${safeName},</p>
          <p>Use the button below to choose a new password for Najah Review Studio.</p>
          <p style="margin:24px 0">
            <a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#157a66;color:#fff;text-decoration:none;font-weight:700">
              Reset password
            </a>
          </p>
          <p>This link expires in 30 minutes and can be used only once.</p>
          <p>If you did not request this change, you can ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    throw new Error("The password-reset email provider did not accept the message.");
  }
}
