"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

/** Let a rater choose a new password from a valid emailed reset token. */
export function ResetPasswordScreen({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!token) {
      setError("This reset link is incomplete. Request a new link from the sign-in page.");
      return;
    }
    if (password !== confirmation) {
      setError("The two passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-najah-auth": "password-reset",
        },
        body: JSON.stringify({ token, password }),
      });
      const responseText = await response.text();
      let payload: { error?: string; message?: string } = {};
      if (responseText) {
        try {
          payload = JSON.parse(responseText) as { error?: string; message?: string };
        } catch {
          // Keep unexpected infrastructure responses out of the account UI.
        }
      }
      if (!response.ok) throw new Error(payload.error || "Unable to reset the password.");
      setPassword("");
      setConfirmation("");
      setSuccess(payload.message || "Your password has been updated. You can now sign in.");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to reset the password.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-introduction">
        <div className="auth-brand"><span>Najah Review Studio</span></div>
        <div className="auth-introduction-copy">
          <p className="auth-eyebrow">Secure account recovery</p>
          <h1>Choose a new password.</h1>
          <p>The reset link is valid for 30 minutes and can be used only once.</p>
        </div>
        <p className="auth-privacy-note">Your ratings and assigned queue will not be changed.</p>
      </section>

      <section className="auth-form-area">
        <div className="auth-card">
          <div className="auth-card-heading">
            <p>Password reset</p>
            <h2>Set your new password</h2>
            <span>Use at least 6 characters. You will sign in again after the reset.</span>
          </div>

          {!success ? (
            <form className="auth-form" onSubmit={submit}>
              <label>
                <span>New password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                  minLength={6}
                  maxLength={128}
                  required
                />
              </label>
              <label>
                <span>Confirm new password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder="Repeat your new password"
                  minLength={6}
                  maxLength={128}
                  required
                />
              </label>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="auth-submit" type="submit" disabled={submitting || !token}>
                {submitting ? "Updating password…" : "Update password"}
              </button>
            </form>
          ) : (
            <div className="auth-complete" role="status">
              <p className="auth-success">{success}</p>
              <Link className="auth-submit auth-submit-link" href="/">Return to sign in</Link>
            </div>
          )}

          {!success && (
            <p className="auth-help"><Link href="/">Return to sign in</Link></p>
          )}
        </div>
      </section>
    </main>
  );
}
