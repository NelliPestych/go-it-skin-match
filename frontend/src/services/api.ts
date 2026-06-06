import type {
  AnalysisDetails,
  AnalysisHistoryItem,
  AnalysisResponse,
  AuthUser,
  BeautyPlan,
  Product,
  QuizPayload,
  RecommendationResponse,
  SkinFeatures,
  TokenResponse,
} from "../types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

/** Thrown on 401 responses so the AuthProvider can react globally
 *  (clear stored token, route to /auth).  Kept distinct from a plain
 *  `Error` so callers can decide whether to surface or swallow it. */
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Convenience predicate so callers can `if (isUnauthorized(err))` and
 *  skip showing a toast — the AuthProvider's global handler will route
 *  the user to /auth on its own. */
export function isUnauthorized(err: unknown): err is UnauthorizedError {
  return err instanceof UnauthorizedError;
}

// ── Token + 401 plumbing ─────────────────────────────────────────────
// Module-level holders kept out of React state on purpose so that
// even pre-mount fetches (rare, but possible during HMR) carry the
// token the user already has in localStorage.

let _authToken: string | null = null;
let _onUnauthorized: (() => void) | null = null;
// One-shot guard: avoids a thundering-herd of logout() calls when
// several authed requests come back 401 in the same tick (common on
// pages that fan out details + recommendations + plan in parallel).
// Re-arms whenever a new token is installed.
let _unauthorizedFired = false;

/** Set/clear the bearer token attached to every authed request.
 *  Called by `AuthProvider` on mount, login, and logout. */
export function setAuthToken(token: string | null): void {
  _authToken = token;
  _unauthorizedFired = false;
}

/** Register a handler that fires once per 401-burst so the
 *  AuthProvider can drop its in-memory state and route to /auth. */
export function setOnUnauthorized(handler: (() => void) | null): void {
  _onUnauthorized = handler;
  // Re-arm so a fresh provider instance (eg. after a hot reload or a
  // new test) gets to react to the next 401 even if a previous one
  // already fired this tick.
  _unauthorizedFired = false;
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const out: Record<string, string> = {};
  if (extra) {
    for (const [k, v] of Object.entries(extra as Record<string, string>)) {
      out[k] = v;
    }
  }
  if (_authToken) {
    out["Authorization"] = `Bearer ${_authToken}`;
  }
  return out;
}

async function readDetail(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data?.detail) {
      return typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail);
    }
  } catch {
    /* non-JSON body — fall through */
  }
  return fallback;
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    if (!_unauthorizedFired) {
      _unauthorizedFired = true;
      _onUnauthorized?.();
    }
    throw new UnauthorizedError(await readDetail(res, "Unauthorized"));
  }
  if (!res.ok) {
    throw new Error(await readDetail(res, `Request failed: ${res.status}`));
  }
  return (await res.json()) as T;
}

export const api = {
  health: async () =>
    handle<{ status: string; database: string; redis: string }>(
      await fetch(`${BASE_URL}/health`),
    ),

  // ── Auth ────────────────────────────────────────────────────────

  register: async (email: string, password: string): Promise<TokenResponse> =>
    handle<TokenResponse>(
      await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
    ),

  login: async (email: string, password: string): Promise<TokenResponse> =>
    handle<TokenResponse>(
      await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
    ),

  // ── Analysis ────────────────────────────────────────────────────

  uploadAnalysis: async (file: File): Promise<AnalysisResponse> => {
    const form = new FormData();
    form.append("file", file);
    return handle<AnalysisResponse>(
      await fetch(`${BASE_URL}/analysis/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      }),
    );
  },

  /**
   * Smart Camera 3-shot upload: posts `front` (required) plus
   * optional `left` / `right` side photos. The backend validates
   * each frame, persists all three, runs heuristic analysis on
   * `front`, and stores the side paths for future multi-angle work.
   *
   * Kept distinct from `uploadAnalysis` so the legacy single-image
   * payload (`file`) remains the obvious default for the manual
   * uploader and any older clients.
   */
  uploadAnalysisMulti: async (input: {
    front: File;
    left?: File | null;
    right?: File | null;
  }): Promise<AnalysisResponse> => {
    const form = new FormData();
    form.append("front", input.front);
    if (input.left) form.append("left", input.left);
    if (input.right) form.append("right", input.right);
    return handle<AnalysisResponse>(
      await fetch(`${BASE_URL}/analysis/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      }),
    );
  },

  submitQuiz: async (payload: QuizPayload) =>
    handle<{ id: number; analysis_id: number }>(
      await fetch(`${BASE_URL}/quiz/submit`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      }),
    ),

  features: async (analysisId: number): Promise<SkinFeatures> =>
    handle<SkinFeatures>(
      await fetch(`${BASE_URL}/analysis/${analysisId}`, {
        headers: authHeaders(),
      }),
    ),

  history: async (): Promise<AnalysisHistoryItem[]> =>
    handle<AnalysisHistoryItem[]>(
      await fetch(`${BASE_URL}/analysis/history`, {
        headers: authHeaders(),
      }),
    ),

  details: async (analysisId: number): Promise<AnalysisDetails> =>
    handle<AnalysisDetails>(
      await fetch(`${BASE_URL}/analysis/${analysisId}/details`, {
        headers: authHeaders(),
      }),
    ),

  recommendations: async (
    analysisId: number,
  ): Promise<RecommendationResponse> =>
    handle<RecommendationResponse>(
      await fetch(`${BASE_URL}/recommendations/${analysisId}`, {
        headers: authHeaders(),
      }),
    ),

  plan: async (analysisId: number): Promise<BeautyPlan> =>
    handle<BeautyPlan>(
      await fetch(`${BASE_URL}/plan/${analysisId}`, {
        headers: authHeaders(),
      }),
    ),

  products: async (): Promise<Product[]> =>
    handle<Product[]>(await fetch(`${BASE_URL}/products`)),
};

export type { AuthUser, TokenResponse };
