/**
 * Auth page — single screen with Sign Up / Log In tabs.
 *
 * UX:
 *   * Default tab is Sign Up.  After the quiz the message is "save
 *     your AI skin report" — most users will be new.
 *   * Already-authenticated visitors are bounced to `?next=…`
 *     (defaults to `/analyzing`) immediately on mount.
 *   * Inline 400 / 401 / 409 errors are rendered above the submit
 *     button; everything else throws and surfaces as a generic
 *     "Something went wrong" string.
 *   * No password-strength meter, no email-confirmation — MVP scope.
 *     Password input keeps `type=password` so browsers/managers
 *     auto-treat it correctly.
 */
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import IconButton from "../components/IconButton";
import PillButton from "../components/PillButton";
import { useAuth } from "../state/auth";

type Mode = "signup" | "login";

// Same-origin relative paths only.  Must start with a single `/`
// followed by something that isn't another `/` or `\` — that's the
// shape a real in-app route takes.  Rejects `//evil.com/path` and
// `/\evil.com/path` (open-redirect vectors), and anything that
// doesn't start with `/` (incl. `javascript:` URIs).
const SAFE_NEXT_RE = /^\/[^/\\]/;

// Mode-aware copy.  Headline / subhead / CTA all branch on this map
// so a "Log In" tab doesn't say "Create your free account" above it.
const COPY: Record<Mode, { headline: string; subhead: string; cta: string }> = {
  signup: {
    headline: "Create your free account",
    subhead:
      "Save your AI skin report, track your analysis history, and access your recommendations anytime.",
    cta: "Create account",
  },
  login: {
    headline: "Welcome back",
    subhead:
      "Log in to pick up your skin journey — your past analyses and recommendations are waiting.",
    cta: "Log in",
  },
};

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, register, login } = useAuth();

  // `?next=` lets the quiz / a route guard bring the user back to
  // exactly where they were going.  Defaults to /analyzing because
  // the documented flow is Quiz → Auth → Analyzing.
  //
  // Open-redirect defence: only accept relative paths that
  // unambiguously stay on this origin.  In particular, we reject
  // protocol-relative paths (`//evil.com/foo`) and backslash variants
  // that some browsers normalise into a host change (`/\evil.com`).
  const nextPath = useMemo(() => {
    const raw = new URLSearchParams(location.search).get("next") || "";
    return SAFE_NEXT_RE.test(raw) ? raw : "/analyzing";
  }, [location.search]);

  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Bounce if we're already logged in.  Effect (not render-time
  // navigate) keeps render pure.
  useEffect(() => {
    if (isAuthenticated) {
      navigate(nextPath, { replace: true });
    }
  }, [isAuthenticated, navigate, nextPath]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError("Please fill in both fields.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "signup") {
        await register(trimmedEmail, password);
      } else {
        await login(trimmedEmail, password);
      }
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="screen auth-screen">
      <div className="app-header">
        <IconButton onClick={() => navigate("/")} aria-label="Back">
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
            <path
              d="M7 1L1 7l6 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconButton>
        <span style={{ width: 44 }} aria-hidden="true" />
        <span style={{ width: 44 }} aria-hidden="true" />
      </div>

      <div className="auth-body screen-pad">
        <h1 className="auth-headline">{COPY[mode].headline}</h1>
        <p className="auth-subhead">{COPY[mode].subhead}</p>

        <div
          className="auth-tabs"
          role="tablist"
          aria-label="Sign up or log in"
        >
          <button
            type="button"
            role="tab"
            className="auth-tab"
            aria-selected={mode === "signup"}
            data-active={mode === "signup"}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
          >
            Sign Up
          </button>
          <button
            type="button"
            role="tab"
            className="auth-tab"
            aria-selected={mode === "login"}
            data-active={mode === "login"}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            Log In
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
            <span className="auth-field-hint">At least 8 characters.</span>
          </label>

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

          <PillButton
            type="submit"
            disabled={submitting}
            trailingIcon={<span aria-hidden>→</span>}
          >
            {COPY[mode].cta}
          </PillButton>
        </form>
      </div>
    </div>
  );
}
