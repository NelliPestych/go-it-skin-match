/**
 * AuthProvider — JWT in localStorage + global 401 handler.
 * Token is XSS-readable; production-grade auth should move to httpOnly cookie + CSRF.
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
    /* private mode, quota — ignore */
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Push token into api.ts inside the lazy initializer so it lands BEFORE
  // any child mount-effect fires a fetch (parent-effect-races-child bug).
  const [auth, setAuth] = useState<StoredAuth | null>(() => {
    const stored = readStored();
    setAuthToken(stored?.token ?? null);
    return stored;
  });

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
    // Push to api.ts BEFORE setState so the next fetch already carries the bearer.
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

export const __AUTH_STORAGE_KEY__ = STORAGE_KEY;
