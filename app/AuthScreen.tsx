"use client";

import { FormEvent, useState } from "react";

type AuthMode = "login" | "register";

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (mode === "register" && password !== confirmPassword) {
      setError("The two passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          mode === "login"
            ? { email, password }
            : { displayName, email, password },
        ),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to sign in.");
      window.location.assign("/");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-introduction">
        <div className="auth-brand">
          <div className="auth-brand-mark" aria-hidden="true">ن</div>
          <span>Najah Review Studio</span>
        </div>
        <div className="auth-introduction-copy">
          <p className="auth-eyebrow">Human evaluation workspace</p>
          <h1>Independent ratings, securely attributed.</h1>
          <p>
            Review de-identified Najah conversations, save drafts privately,
            and build a reliable human reference dataset.
          </p>
          <ul>
            <li><span>01</span> Named rater accounts</li>
            <li><span>02</span> Separate drafts and completed ratings</li>
            <li><span>03</span> Protected conversation and annotation data</li>
          </ul>
        </div>
        <p className="auth-privacy-note">Sign in is required to view the review workspace.</p>
      </section>

      <section className="auth-form-area">
        <div className="auth-card">
          <div className="auth-mode-tabs" aria-label="Account access">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => changeMode("login")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === "register" ? "active" : ""}
              onClick={() => changeMode("register")}
            >
              Create account
            </button>
          </div>

          <div className="auth-card-heading">
            <p>{mode === "login" ? "Welcome back" : "New rater account"}</p>
            <h2>{mode === "login" ? "Sign in to continue" : "Create your rater account"}</h2>
            <span>
              {mode === "login"
                ? "Use the email and password for your Najah account."
                : "Create an account with your email and a secure password."}
            </span>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === "register" && (
              <label>
                <span>Full name</span>
                <input
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Your name"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>
            )}
            <label>
              <span>Email address</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.org"
                required
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === "register" ? "At least 6 characters" : "Your password"}
                required
                minLength={mode === "register" ? 6 : undefined}
                maxLength={128}
              />
            </label>
            {mode === "register" && (
              <>
                <label>
                  <span>Confirm password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat your password"
                    required
                    minLength={6}
                    maxLength={128}
                  />
                </label>
              </>
            )}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting
                ? mode === "login" ? "Signing in…" : "Creating account…"
                : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="auth-help">
            {mode === "login"
              ? "Need an account? Choose Create account above."
              : "Already registered? Return to Sign in."}
          </p>
        </div>
      </section>
    </main>
  );
}
