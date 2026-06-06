/**
 * AuthProvider — minimal MVP auth context.
 *
 * Responsibilities:
 *   * Hold the current `{ token, user }` pair in React state.
 *   * Mirror it to localStorage under a stable key so a refresh
 *     keeps the session.
 *   * Push the token into `services/api.ts` so every fetch carries
 *     `Authorization: Bearer <token>` automatically.
 *   * Subscribe to api.ts's `onUnauthorized` callback so a 401 from
 *     ANY endpoint clears the token + state without per-call wiring.
 *
 * Storage choice (localStorage):
 *   * Survives reloads without a backend round-trip.
 *   * Vulnerable to XSS — documented as an MVP limitation in README.
 *     For production-grade auth, move the token to an httpOnly cookie
 *     and add CSRF.  That swap is contained: the AuthProvider's
 *     surface stays the same, only the read/write helpers change.
 */
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  api,
  setAuthToken,
  setOnUnauthorized,
  type AuthUser,
  type TokenResponse,
} from "../services/api";

const STORAGE_KEY = "skinmatch.auth";

interface StoredAuth {
  token: string;
  user: AuthUser;
}

function readStored(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    if (
      parsed &&
      typeof parsed.token === "string" &&
      parsed.user &&
      typeof parsed.user.email === "string"
    ) {
      return { token: parsed.token, user: parsed.user as AuthUser };
    }
    return null;
  } catch {
    return null;
  }
}

function writeStored(value: StoredAuth | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* private mode, quota — silently ignore */
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  /** Resolves with the new user on success; throws on bad credentials. */
  login: (email: string, password: string) => Promise<AuthUser>;
  /** Resolves with the new user on success; throws on 409/422. */
  register: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Hydrate from storage exactly once on mount AND push the token
  // into api.ts during the lazy initializer — synchronously, before
  // any child effect fires.  Doing it in a useEffect was racy: a
  // child page that issues a fetch in its own mount effect runs
  // BEFORE the parent's auth effect, so the first request after a
  // refresh / register / login would leak out as anonymous.  The
  // initializer runs once during the first render's body, so by the
  // time anything mounts the token is already in place.
  const [auth, setAuth] = useState<StoredAuth | null>(() => {
    const stored = readStored();
    setAuthToken(stored?.token ?? null);
    return stored;
  });

  // Global 401 handler — single source of truth for "token went bad".
  useEffect(() => {
    setOnUnauthorized(() => {
      setAuthToken(null);
      setAuth(null);
      writeStored(null);
    });
    return () => setOnUnauthorized(null);
  }, []);

  const adopt = useCallback((res: TokenResponse) => {
    const next: StoredAuth = { token: res.access_token, user: res.user };
    // Push into api.ts BEFORE the state update so the very next
    // fetch — including one fired by a sibling component's mount
    // effect after the post-login redirect — already carries the
    // bearer.  See the comment on useState above.
    setAuthToken(next.token);
    writeStored(next);
    setAuth(next);
    return res.user;
  }, []);

  const login = useCallback(
    async (email: string, password: string) => adopt(await api.login(email, password)),
    [adopt],
  );

  const register = useCallback(
    async (email: string, password: string) =>
      adopt(await api.register(email, password)),
    [adopt],
  );

  const logout = useCallback(() => {
    setAuthToken(null);
    setAuth(null);
    writeStored(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: auth?.user ?? null,
      token: auth?.token ?? null,
      isAuthenticated: Boolean(auth?.token),
      login,
      register,
      logout,
    }),
    [auth, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside an <AuthProvider>");
  }
  return ctx;
}

/** Tiny exports for tests so they can inspect the storage shape
 *  without re-implementing it. */
export const __AUTH_STORAGE_KEY__ = STORAGE_KEY;
