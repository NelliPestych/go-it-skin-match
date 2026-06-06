/**
 * RequireAuth — wraps a route element and redirects to `/auth` when
 * the user is anonymous.  Keeps the originally-requested path in
 * `?next=…` so the AuthPage can bounce the user straight back after
 * login.
 *
 * Intentionally a thin component (no loading state, no async check)
 * because `useAuth()` reads from localStorage synchronously on mount.
 */
import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../state/auth";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }
  return <>{children}</>;
}
