/**
 * RequireAuth tests.
 *
 * Two-line invariant: anonymous user on a protected route → /auth
 * with `?next=` preserving the originally-requested path; logged-in
 * user passes through to the wrapped element.
 */
import { render, screen } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthProvider, __AUTH_STORAGE_KEY__ } from "../state/auth";

import RequireAuth from "./RequireAuth";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

function appUnder(memoryEntry: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[memoryEntry]}>
        <Routes>
          <Route
            path="/history"
            element={
              <RequireAuth>
                <div data-testid="protected">protected content</div>
              </RequireAuth>
            }
          />
          <Route
            path="/auth"
            element={
              <div data-testid="auth-page">
                {/* Mirror the AuthPage's `?next=` lookup so we can
                    assert on the bounce target without rendering the
                    whole page. */}
                <NextEcho />
              </div>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

function NextEcho() {
  // MemoryRouter doesn't touch window.location — read from React
  // Router's own location object.
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  return <span data-testid="next">{params.get("next") ?? ""}</span>;
}

describe("<RequireAuth />", () => {
  it("redirects anonymous users to /auth with the original path as ?next=", () => {
    appUnder("/history?ref=demo");
    expect(screen.getByTestId("auth-page")).toBeInTheDocument();
    // ?next should round-trip the original path + query (URLSearchParams
    // decodes it on read so we compare the decoded value).
    expect(screen.getByTestId("next").textContent).toBe("/history?ref=demo");
  });

  it("renders the wrapped element when the user is authenticated", () => {
    window.localStorage.setItem(
      __AUTH_STORAGE_KEY__,
      JSON.stringify({
        token: "jwt.fake.token",
        user: { id: 1, email: "alice@example.com", created_at: "2026-01-01T00:00:00Z" },
      }),
    );
    appUnder("/history");
    expect(screen.getByTestId("protected")).toBeInTheDocument();
  });
});
