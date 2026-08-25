/**
 * Prefix used for an administrator-created account that has not yet selected a
 * password. The value intentionally cannot pass normal password verification.
 */
export const INVITED_PASSWORD_PREFIX = "invited-account$";

/** Build an unguessable placeholder for a participant invited by an admin. */
export function invitedPasswordPlaceholder(): string {
  return `${INVITED_PASSWORD_PREFIX}${crypto.randomUUID()}`;
}

/** Determine whether a participant still needs to claim their email account. */
export function isInvitedPassword(passwordHash: string): boolean {
  return passwordHash.startsWith(INVITED_PASSWORD_PREFIX);
}
