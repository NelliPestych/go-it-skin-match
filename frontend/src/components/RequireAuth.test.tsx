/** Anonymous → /auth?next=<original>; authenticated → wrapped element. */
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
  // MemoryRouter doesn't touch window.location.
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  return <span data-testid="next">{params.get("next") ?? ""}</span>;
}

describe("<RequireAuth />", () => {
  it("redirects anonymous users to /auth with the original path as ?next=", () => {
    appUnder("/history?ref=demo");
    expect(screen.getByTestId("auth-page")).toBeInTheDocument();
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
