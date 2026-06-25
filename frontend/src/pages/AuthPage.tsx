import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import IconButton from "../components/IconButton";
import PillButton from "../components/PillButton";
import { useAuth } from "../state/auth";

type Mode = "signup" | "login";

// Same-origin only. Rejects `//evil.com`, `/\evil.com`, scheme URIs.
const SAFE_NEXT_RE = /^\/[^/\\]/;

// Lightweight client-side check — catches the common "no @ / no domain" cases
// before we ever hit the server, so users see a friendly hint instantly.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Turn whatever the API throws into a calm, human message.
 * Raw FastAPI/Pydantic validation payloads (JSON arrays) never reach the user;
 * the backend's own short messages ("Invalid email or password") pass through.
 */
function friendlyAuthError(err: unknown): string {
  const raw = (err instanceof Error ? err.message : "").trim();
  if (!raw) return "Something went wrong. Please try again.";
  // Raw JSON validation payload — don't show it verbatim.
  if (raw.startsWith("[") || raw.startsWith("{")) {
    return /email/i.test(raw)
      ? "Please enter a valid email address."
      : "Please check your details and try again.";
  }
  if (/\bvalid email/i.test(raw)) return "Please enter a valid email address.";
  return raw;
}

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

  const nextPath = useMemo(() => {
    const raw = new URLSearchParams(location.search).get("next") || "";
    return SAFE_NEXT_RE.test(raw) ? raw : "/analyzing";
  }, [location.search]);

  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
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
      setError(friendlyAuthError(err));
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
            <div className="auth-input-wrap">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
              <button
                type="button"
                className="auth-reveal"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                title={showPassword ? "Hide password" : "Show password"}
                disabled={submitting}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.4 5.2A9.6 9.6 0 0112 5c5 0 9 4.5 9 7 0 1-.7 2.3-1.9 3.6M6.3 6.3C3.9 7.7 3 10 3 12c0 2.5 4 7 9 7 1.4 0 2.7-.3 3.8-.9"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                )}
              </button>
            </div>
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
