/** DesktopGate — viewport-width gating. */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DesktopGate from "./DesktopGate";

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("<DesktopGate />", () => {
  it("shows the QR gate (and hides the app) on a wide viewport", () => {
    mockMatchMedia(true);
    render(
      <DesktopGate>
        <div>APP CONTENT</div>
      </DesktopGate>,
    );
    expect(screen.getByText(/open on your phone/i)).toBeInTheDocument();
    const qr = screen.getByRole("img", { name: /opens skinmatch on your phone/i });
    expect(qr).toHaveAttribute("src", "/app-qr.svg");
    expect(screen.queryByText("APP CONTENT")).not.toBeInTheDocument();
  });

  it("renders the app untouched on a narrow viewport", () => {
    mockMatchMedia(false);
    render(
      <DesktopGate>
        <div>APP CONTENT</div>
      </DesktopGate>,
    );
    expect(screen.getByText("APP CONTENT")).toBeInTheDocument();
    expect(screen.queryByText(/open on your phone/i)).not.toBeInTheDocument();
  });
});
