/** Roles recognized by the Najah review workspace. */
export type UserRole = "admin" | "rater" | "viewer";

/** Roles an administrator may assign to ordinary participants. */
export type ParticipantRole = Exclude<UserRole, "admin">;

export const PARTICIPANT_ROLES: readonly ParticipantRole[] = ["rater", "viewer"];

/** Human-readable role label used consistently across the workspace. */
export function userRoleLabel(role: UserRole): string {
  if (role === "admin") return "Admin";
  if (role === "viewer") return "Viewer";
  return "Rater";
}

/** Return true only for a role an administrator may assign to a participant. */
export function isParticipantRole(value: unknown): value is ParticipantRole {
  return PARTICIPANT_ROLES.some((role) => role === value);
}
