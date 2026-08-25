"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type AuthMode = "login" | "register";

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
      const responseText = await response.text();
      let payload: { error?: string } = {};
      if (responseText) {
        try {
          payload = JSON.parse(responseText) as { error?: string };
        } catch {
          // A proxy or unexpected server failure may return a non-JSON body.
          // The fallback below keeps that infrastructure detail out of the UI.
        }
      }
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
          {googleClientId && (
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
            <p>{mode === "login" ? "Email sign in" : "New rater account"}</p>
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
