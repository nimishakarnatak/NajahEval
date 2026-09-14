"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type AuthMode = "login" | "register" | "forgot";

type GoogleCredentialResponse = { credential?: string };

type GoogleIdentityApi = {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
      }): void;
      renderButton(
        target: HTMLElement,
        options: {
          type: "standard";
          theme: "outline";
          size: "large";
          text: "continue_with";
          shape: "rectangular";
          logo_alignment: "left";
          width: number;
        },
      ): void;
      cancel(): void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";

/**
 * Display the public rater sign-in screen.
 *
 * Google is presented first because it lets a rater create or access an
 * account without managing another password. The existing email/password
 * forms remain available as a fallback and continue to use the same account
 * table, so previously saved ratings stay attached to the rater's email.
 */
export function AuthScreen({ googleClientId }: { googleClientId: string }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!googleClientId) return;
    let active = true;

    /** Exchange Google's short-lived ID token for the app's secure session. */
    async function completeGoogleSignIn(response: GoogleCredentialResponse) {
      if (!response.credential) {
        setError("Google did not return a sign-in credential. Please try again.");
        return;
      }
      setError("");
      setSubmitting(true);
      try {
        const result = await fetch("/api/auth/google", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-najah-auth": "google",
          },
          body: JSON.stringify({ credential: response.credential }),
        });
        const responseText = await result.text();
        let payload: { error?: string } = {};
        if (responseText) {
          try {
            payload = JSON.parse(responseText) as { error?: string };
          } catch {
            // Keep unexpected proxy/server response details out of the UI.
          }
        }
        if (!result.ok) throw new Error(payload.error || "Unable to sign in with Google.");
        window.location.assign("/");
      } catch (requestError) {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to sign in with Google.",
          );
        }
      } finally {
        if (active) setSubmitting(false);
      }
    }

    /** Initialize Google's official button after its browser library is ready. */
    function renderGoogleButton() {
      if (!active || !window.google || !googleButtonRef.current) return;
      googleButtonRef.current.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: completeGoogleSignIn,
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: Math.min(360, googleButtonRef.current.clientWidth || 360),
      });
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_IDENTITY_SCRIPT}"]`,
    );
    if (window.google) {
      renderGoogleButton();
    } else if (existingScript) {
      existingScript.addEventListener("load", renderGoogleButton, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = GOOGLE_IDENTITY_SCRIPT;
      script.async = true;
      script.addEventListener("load", renderGoogleButton, { once: true });
      script.addEventListener(
        "error",
        () => active && setError("Google sign-in could not load. Use email sign-in below."),
        { once: true },
      );
      document.head.appendChild(script);
    }

    return () => {
      active = false;
      existingScript?.removeEventListener("load", renderGoogleButton);
      window.google?.accounts.id.cancel();
    };
  }, [googleClientId]);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setSuccess("");
    setPassword("");
    setConfirmPassword("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (mode === "register" && password !== confirmPassword) {
      setError("The two passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = mode === "login"
        ? "/api/auth/login"
        : mode === "register"
          ? "/api/auth/register"
          : "/api/auth/forgot-password";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(mode === "forgot" ? { "x-najah-auth": "password-reset" } : {}),
        },
        body: JSON.stringify(
          mode === "login"
            ? { email, password }
            : mode === "register"
              ? { displayName, email, password }
              : { email },
        ),
      });
      const responseText = await response.text();
      let payload: { error?: string; message?: string } = {};
      if (responseText) {
        try {
          payload = JSON.parse(responseText) as { error?: string; message?: string };
        } catch {
          // A proxy or unexpected server failure may return a non-JSON body.
          // The fallback below keeps that infrastructure detail out of the UI.
        }
      }
      if (!response.ok) {
        throw new Error(
          payload.error || (mode === "forgot" ? "Unable to send the reset email." : "Unable to sign in."),
        );
      }
      if (mode === "forgot") {
        setSuccess(
          payload.message ||
            "If an active password account exists for that email, a reset link has been sent.",
        );
        return;
      }
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
          {googleClientId && mode !== "forgot" && (
            <>
              <div className="google-auth-heading">
                <p>Rater access</p>
                <h2>Continue to Najah Review Studio</h2>
                <span>Use your Google account—no ChatGPT account is required.</span>
              </div>
              <div
                className={submitting ? "google-sign-in is-busy" : "google-sign-in"}
                ref={googleButtonRef}
                aria-label="Continue with Google"
              />
              <div className="auth-divider"><span>or use email</span></div>
            </>
          )}

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
            <p>
              {mode === "login"
                ? "Email sign in"
                : mode === "register"
                  ? "New rater account"
                  : "Account recovery"}
            </p>
            <h2>
              {mode === "login"
                ? "Sign in to continue"
                : mode === "register"
                  ? "Create your rater account"
                  : "Reset your password"}
            </h2>
            <span>
              {mode === "login"
                ? "Use the email and password for your Najah account."
                : mode === "register"
                  ? "Create an account with your email and a secure password."
                  : "Enter your account email and we will send you a secure reset link."}
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
            {mode !== "forgot" && (
              <label>
                <span className="auth-password-label">
                  Password
                  {mode === "login" && (
                    <button
                      type="button"
                      className="auth-inline-action"
                      onClick={() => changeMode("forgot")}
                    >
                      Forgot password?
                    </button>
                  )}
                </span>
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
            )}
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
            {success && <p className="auth-success" role="status">{success}</p>}
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting
                ? mode === "login"
                  ? "Signing in…"
                  : mode === "register"
                    ? "Creating account…"
                    : "Sending reset link…"
                : mode === "login"
                  ? "Sign in"
                  : mode === "register"
                    ? "Create account"
                    : "Send reset link"}
            </button>
          </form>

          <p className="auth-help">
            {mode === "login"
              ? "Need an account? Choose Create account above."
              : mode === "register"
                ? "Already registered? Return to Sign in."
                : (
                  <button type="button" className="auth-text-button" onClick={() => changeMode("login")}>
                    Return to sign in
                  </button>
                )}
          </p>
        </div>
      </section>
    </main>
  );
}
