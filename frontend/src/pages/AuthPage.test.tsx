/** AuthPage — password reveal toggle behavior. */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AuthProvider } from "../state/auth";

import AuthPage from "./AuthPage";

function renderAuth() {
  return render(
    <MemoryRouter initialEntries={["/auth"]}>
      <AuthProvider>
        <AuthPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function fillAndSubmit(email: string, password: string) {
  const emailInput = document.querySelector(
    'input[autocomplete="email"]',
  ) as HTMLInputElement;
  const pwInput = document.querySelector(
    'input[autocomplete="new-password"]',
  ) as HTMLInputElement;
  fireEvent.change(emailInput, { target: { value: email } });
  fireEvent.change(pwInput, { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));
}

describe("<AuthPage /> email validation", () => {
  it("shows a friendly message for an invalid email — without hitting the server", () => {
    renderAuth();
    fillAndSubmit("sdfertbbwfdffd", "longenough123");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please enter a valid email address.",
    );
    // No raw Pydantic payload leaks through.
    expect(screen.queryByText(/value_error|@-sign/i)).not.toBeInTheDocument();
  });
});

describe("<AuthPage /> password reveal", () => {
  it("toggles the password field between hidden and visible", () => {
    const { container } = renderAuth();
    const pw = container.querySelector(
      'input[autocomplete="new-password"]',
    ) as HTMLInputElement;

    // Hidden by default.
    expect(pw.type).toBe("password");

    // Reveal.
    fireEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(pw.type).toBe("text");

    // Hide again.
    fireEvent.click(screen.getByRole("button", { name: /hide password/i }));
    expect(pw.type).toBe("password");
  });
});
