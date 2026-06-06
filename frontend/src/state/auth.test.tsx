/**
 * AuthProvider tests.
 *
 * What's pinned here:
 *
 * 1. **Hydration** — a token already present in localStorage on mount
 *    is picked up; `isAuthenticated` flips to `true` on the first
 *    render without an extra network call.
 * 2. **Login** — a successful `api.login` call stores the
 *    `{ token, user }` pair in localStorage, exposes them on
 *    `useAuth()`, and any subsequent `fetch` triggered by `api.*`
 *    carries the `Authorization: Bearer <token>` header.
 * 3. **Logout** — clears both state and localStorage; subsequent
 *    fetches no longer carry the bearer header.
 * 4. **401 handling** — a 401 from any `api.*` call clears the auth
 *    state automatically via the `setOnUnauthorized` callback.
 *
 * We mock the global `fetch` so no real network ever runs; the
 * assertions look at the exact `Headers` the wrapper attached.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../services/api";
import { AuthProvider, __AUTH_STORAGE_KEY__, useAuth } from "./auth";

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function mockResponse(body: unknown, init: { status?: number } = {}): Response {
  const status = init.status ?? 200;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const DEMO_USER = { id: 1, email: "alice@example.com", created_at: "2026-01-01T00:00:00Z" };
const DEMO_TOKEN = "jwt.fake.token";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("AuthProvider", () => {
  it("hydrates from localStorage on mount", () => {
    window.localStorage.setItem(
      __AUTH_STORAGE_KEY__,
      JSON.stringify({ token: DEMO_TOKEN, user: DEMO_USER }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe(DEMO_TOKEN);
    expect(result.current.user).toEqual(DEMO_USER);
  });

  it("ignores malformed localStorage payloads", () => {
    window.localStorage.setItem(__AUTH_STORAGE_KEY__, "{not valid json");

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("stores token + user on successful login and attaches the bearer on the NEXT fetch", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(_input);
        if (url.endsWith("/auth/login")) {
          return mockResponse({
            access_token: DEMO_TOKEN,
            token_type: "bearer",
            user: DEMO_USER,
          });
        }
        if (url.endsWith("/analysis/history")) {
          // Echo back the Authorization header in the body so the
          // test can assert on it without rummaging through the
          // request directly.
          const headers = new Headers(init?.headers);
          return mockResponse({
            seen_auth: headers.get("Authorization") ?? null,
          });
        }
        return mockResponse({}, { status: 404 });
      });

    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isAuthenticated).toBe(false);

    await act(async () => {
      await result.current.login("alice@example.com", "password123");
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe("alice@example.com");
    // localStorage persisted the same shape.
    const stored = JSON.parse(
      window.localStorage.getItem(__AUTH_STORAGE_KEY__) ?? "null",
    );
    expect(stored.token).toBe(DEMO_TOKEN);
    expect(stored.user.email).toBe("alice@example.com");

    // Next api.* call carries the bearer.
    const echoed = (await api.history()) as unknown as { seen_auth: string };
    expect(echoed.seen_auth).toBe(`Bearer ${DEMO_TOKEN}`);

    expect(fetchMock).toHaveBeenCalled();
  });

  it("attaches the bearer SYNCHRONOUSLY — even on a fetch fired in the same microtask as login resolves (regression: AnalyzingPage race)", async () => {
    // Reproduces the bug where AnalyzingPage's mount effect ran its
    // /analysis/upload fetch BEFORE AuthProvider's "push token into
    // api.ts" useEffect fired, so the request leaked out as
    // anonymous and the backend's demo-user fallback picked it up.
    // The fix moves the setAuthToken push into adopt() + the
    // useState lazy initializer so it lands before any child mount
    // effect runs.
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const url = String(_input);
      if (url.endsWith("/auth/login")) {
        return mockResponse({
          access_token: DEMO_TOKEN,
          token_type: "bearer",
          user: DEMO_USER,
        });
      }
      const headers = new Headers(init?.headers);
      return mockResponse({
        seen_auth: headers.get("Authorization") ?? null,
      });
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    // Note: NO `act` wrapping around the chained call below — the
    // bug only repro'd before React flushed any effects.  We
    // explicitly invoke history() in the same microtask as login's
    // resolve, mimicking a navigation + mount-effect fetch.
    let echoed: { seen_auth: string | null } | null = null;
    await act(async () => {
      await result.current.login("alice@example.com", "password123").then(() => {
        // Same continuation as `await login(...); api.history()`
        // would do inside an effect — no waiting for re-render.
        return api.history().then((r) => {
          echoed = r as unknown as { seen_auth: string | null };
        });
      });
    });
    expect(echoed).not.toBeNull();
    expect(echoed!.seen_auth).toBe(`Bearer ${DEMO_TOKEN}`);
  });

  it("logout clears state, storage, and the bearer header on subsequent fetches", async () => {
    window.localStorage.setItem(
      __AUTH_STORAGE_KEY__,
      JSON.stringify({ token: DEMO_TOKEN, user: DEMO_USER }),
    );

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const url = String(_input);
      if (url.endsWith("/analysis/history")) {
        const headers = new Headers(init?.headers);
        return mockResponse({
          seen_auth: headers.get("Authorization") ?? null,
        });
      }
      return mockResponse({}, { status: 404 });
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(window.localStorage.getItem(__AUTH_STORAGE_KEY__)).toBeNull();

    const echoed = (await api.history()) as unknown as { seen_auth: string | null };
    expect(echoed.seen_auth).toBeNull();
  });

  it("clears the session when any api.* call returns 401", async () => {
    window.localStorage.setItem(
      __AUTH_STORAGE_KEY__,
      JSON.stringify({ token: DEMO_TOKEN, user: DEMO_USER }),
    );

    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      mockResponse({ detail: "Invalid or expired auth token" }, { status: 401 }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isAuthenticated).toBe(true);

    // Call any authed endpoint — the api wrapper throws and the
    // AuthProvider's onUnauthorized hook resets state.
    await act(async () => {
      await expect(api.history()).rejects.toThrow(/Unauthorized|expired|Invalid/i);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(window.localStorage.getItem(__AUTH_STORAGE_KEY__)).toBeNull();
  });
});
