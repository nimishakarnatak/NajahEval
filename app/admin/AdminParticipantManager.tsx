"use client";

import { useCallback, useEffect, useState } from "react";

import {
  PARTICIPANT_ROLES,
  type ParticipantRole,
  type UserRole,
  userAccessLabel,
  userRoleLabel,
} from "@/lib/user-roles";

type ManagedUser = {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  canRate: boolean;
  isActive: boolean;
  invited: boolean;
  createdAt: string;
};

type RequestMethod = "POST" | "PATCH" | "DELETE";

/**
 * Admin-only participant access manager.
 *
 * User removal revokes sessions but does not erase historical annotations.
 * Permanent deletion is available only after removal and requires the
 * administrator to type the participant's email before saved work is erased.
 * Role changes take effect immediately because every request resolves the role
 * from the server-side user record rather than trusting browser state.
 */
export function AdminParticipantManager({ adminEmail }: { adminEmail: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ParticipantRole>("rater");
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load participant access.");
      setUsers(payload.users ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load participant access.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Schedule the request after the effect has committed. This avoids a
    // synchronous loading-state update during effect execution and cancels the
    // initial request cleanly if the dashboard unmounts immediately.
    const initialLoad = window.setTimeout(() => void loadUsers(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadUsers]);

  async function mutate(method: RequestMethod, body: Record<string, unknown>) {
    const response = await fetch("/api/admin/users", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "The access change could not be saved.");
  }

  async function addParticipant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyUserId("new");
    setError("");
    setMessage("");
    try {
      await mutate("POST", { displayName, email, role });
      setDisplayName("");
      setEmail("");
      setRole("rater");
      setMessage("Participant access added. They can now register or use Google sign-in.");
      await loadUsers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to add this participant.");
    } finally {
      setBusyUserId("");
    }
  }

  async function changeRole(user: ManagedUser, nextRole: ParticipantRole) {
    setBusyUserId(user.userId);
    setError("");
    setMessage("");
    try {
      await mutate("PATCH", { userId: user.userId, role: nextRole });
      setMessage(`${user.displayName} is now a ${userRoleLabel(nextRole).toLowerCase()}.`);
      await loadUsers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to change this role.");
    } finally {
      setBusyUserId("");
    }
  }

  /** Toggle only rating permission; the configured administrator stays admin. */
  async function changeAdminRaterStatus(user: ManagedUser, canRate: boolean) {
    setBusyUserId(user.userId);
    setError("");
    setMessage("");
    try {
      await mutate("PATCH", {
        userId: user.userId,
        mode: "rating_access",
        canRate,
      });
      setMessage(
        canRate
          ? `${user.displayName} is now an ${userAccessLabel(user.role, true)}.`
          : `${user.displayName}'s rater status was removed. Admin access and saved ratings were preserved.`,
      );
      await loadUsers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to change rater status.");
    } finally {
      setBusyUserId("");
    }
  }

  async function removeParticipant(user: ManagedUser) {
    if (!window.confirm(`Remove ${user.displayName}'s access? Their saved ratings will be preserved.`)) return;
    setBusyUserId(user.userId);
    setError("");
    setMessage("");
    try {
      await mutate("DELETE", { userId: user.userId });
      setMessage(`${user.displayName}'s access was removed. Historical ratings were preserved.`);
      await loadUsers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to remove access.");
    } finally {
      setBusyUserId("");
    }
  }

  async function restoreParticipant(user: ManagedUser) {
    setBusyUserId(user.userId);
    setError("");
    setMessage("");
    try {
      await mutate("POST", {
        displayName: user.displayName,
        email: user.email,
        role: user.role === "viewer" ? "viewer" : "rater",
      });
      setMessage(`${user.displayName}'s access was restored.`);
      await loadUsers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to restore access.");
    } finally {
      setBusyUserId("");
    }
  }

  async function deleteParticipantPermanently(user: ManagedUser) {
    const confirmation = window.prompt(
      `Permanently delete ${user.displayName}? This will erase the account, drafts, and completed ratings and cannot be undone.\n\nType ${user.email} to confirm.`,
    );
    if (confirmation?.trim().toLowerCase() !== user.email.toLowerCase()) return;

    setBusyUserId(user.userId);
    setError("");
    setMessage("");
    try {
      await mutate("DELETE", { userId: user.userId, mode: "permanent" });
      setMessage(`${user.displayName}'s account and saved ratings were permanently deleted.`);
      await loadUsers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete this participant.");
    } finally {
      setBusyUserId("");
    }
  }

  return (
    <section className="admin-access-card" aria-labelledby="participant-access-title">
      <div className="admin-section-heading access-heading">
        <div>
          <p className="admin-eyebrow">Participant access</p>
          <h2 id="participant-access-title">Raters and viewers</h2>
          <p>Add people, change their access level, or remove access without deleting saved work.</p>
        </div>
        <span>{users.filter((user) => user.isActive).length} active</span>
      </div>

      <div className="admin-role-guide">
        <div><strong>Rater</strong><span>Can read conversations and submit evaluations.</span></div>
        <div><strong>Viewer</strong><span>Can read conversations but cannot save or submit ratings.</span></div>
        <div><strong>Admin + Rater</strong><span>Manages the study and can also submit ratings under the same account. Assigned to {adminEmail}.</span></div>
      </div>

      <form className="admin-add-participant" onSubmit={addParticipant}>
        <label>
          <span>Full name</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Participant name"
            required
            minLength={2}
            maxLength={80}
          />
        </label>
        <label>
          <span>Email address</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.org"
            required
          />
        </label>
        <label>
          <span>Access level</span>
          <select value={role} onChange={(event) => setRole(event.target.value as ParticipantRole)}>
            {PARTICIPANT_ROLES.map((participantRole) => (
              <option key={participantRole} value={participantRole}>{userRoleLabel(participantRole)}</option>
            ))}
          </select>
        </label>
        <button className="primary-button" disabled={busyUserId === "new"}>
          {busyUserId === "new" ? "Adding…" : "Add participant"}
        </button>
      </form>

      {(error || message) && (
        <p className={error ? "admin-access-message error" : "admin-access-message success"} role="status">
          {error || message}
        </p>
      )}

      {loading ? (
        <div className="admin-access-loading">Loading participant access…</div>
      ) : (
        <div className="admin-table-scroll">
          <table className="admin-access-table">
            <thead>
              <tr><th>Participant</th><th>Role</th><th>Account</th><th>Access</th></tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isAdmin = user.role === "admin";
                const busy = busyUserId === user.userId;
                return (
                  <tr key={user.userId} className={user.isActive ? "" : "access-removed"}>
                    <td>
                      <span className="admin-evaluator-identity">
                        <span className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>
                        <span><strong>{user.displayName}</strong><small>{user.email}</small></span>
                      </span>
                    </td>
                    <td>
                      {isAdmin ? (
                        <span className="admin-access-actions">
                          <span className="admin-fixed-role">Admin</span>
                          {user.canRate && <span className="admin-fixed-role">Rater</span>}
                        </span>
                      ) : (
                        <select
                          className="admin-role-select"
                          value={user.role}
                          disabled={!user.isActive || busy}
                          aria-label={`Role for ${user.displayName}`}
                          onChange={(event) => void changeRole(user, event.target.value as ParticipantRole)}
                        >
                          {PARTICIPANT_ROLES.map((participantRole) => (
                            <option key={participantRole} value={participantRole}>{userRoleLabel(participantRole)}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      <span className={`account-state ${user.invited ? "invited" : "registered"}`}>
                        {user.invited ? "Invited" : "Registered"}
                      </span>
                    </td>
                    <td>
                      {isAdmin ? (
                        <span className="admin-access-actions">
                          <span className="admin-protected-access">Admin protected</span>
                          <button
                            type="button"
                            className={user.canRate ? "remove-access-button" : "restore-access-button"}
                            disabled={busy}
                            aria-label={`${user.canRate ? "Remove" : "Add"} rater status for ${user.displayName}`}
                            onClick={() => void changeAdminRaterStatus(user, !user.canRate)}
                          >
                            {busy
                              ? "Updating…"
                              : user.canRate
                                ? "Remove rater status"
                                : "Add rater status"}
                          </button>
                        </span>
                      ) : user.isActive ? (
                        <button
                          type="button"
                          className="remove-access-button"
                          disabled={busy}
                          onClick={() => void removeParticipant(user)}
                        >
                          {busy ? "Updating…" : "Remove"}
                        </button>
                      ) : (
                        <span className="admin-access-actions">
                          <button
                            type="button"
                            className="restore-access-button"
                            disabled={busy}
                            onClick={() => void restoreParticipant(user)}
                          >
                            {busy ? "Updating…" : "Restore"}
                          </button>
                          <button
                            type="button"
                            className="permanent-delete-button"
                            disabled={busy}
                            onClick={() => void deleteParticipantPermanently(user)}
                          >
                            {busy ? "Updating…" : "Delete permanently"}
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
