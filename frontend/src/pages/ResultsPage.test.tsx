/**
 * ResultsPage integration tests.
 *
 * Three scenarios cover the production matrix:
 *   1. Modern AI provider (mock_haut) → renders extended metrics,
 *      "AI-powered analysis" label, focus areas and insights.
 *   2. Legacy sentinel (provider === "legacy") → renders the basic
 *      profile and "Basic analysis" label, no extended metric rows.
 *   3. Missing `ai_metrics` entirely (old scan persisted before the
 *      provider abstraction) → same fallback as #2, no crash.
 *
 * We stub the `api.details` function rather than `fetch`, so the
 * tests stay close to the actual data contract without coupling to
 * internal URL strings.  This also means a backend rename of the
 * details endpoint would only fail the api-layer test, not these.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../services/api";
import type { AnalysisDetails } from "../types";

import ResultsPage from "./ResultsPage";

function renderResults(id = 42) {
  return render(
    <MemoryRouter initialEntries={[`/results/${id}`]}>
      <Routes>
        <Route path="/results/:analysisId" element={<ResultsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const baseDetails: AnalysisDetails = {
  analysis_id: 42,
  created_at: "2026-05-14T10:00:00Z",
  features: {
    skin_type: "combination",
    redness_level: "low",
    hydration_level: "low",
    pigmentation_level: "low",
    pores_score: 0.55,
    confidence_score: 0.6,
  },
  recommendations: [
    {
      product: {
        id: 1,
        brand: "TestBrand",
        name: "Hydrating Cleanser",
        category: "cleanser",
        skin_types: ["combination"],
        concerns: ["hydration"],
        ingredients: ["glycerin"],
        price: 24,
      },
      score: 0.9,
      reasons: ["matches hydration needs"],
    },
  ],
  plan: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("<ResultsPage />", () => {
  it("renders the AI report with extended metrics for a modern provider", async () => {
    vi.spyOn(api, "details").mockResolvedValue({
      ...baseDetails,
      ai_metrics: {
        provider: "mock_haut",
        confidence_score: 0.82,
        oiliness: "high",
        acne: "medium",
        fine_lines: "low",
        texture: "medium",
      },
    });

    renderResults();

    await screen.findByText(/Confidence: High/i);

    // Source label uses the user-facing wording, not the raw provider id.
    expect(screen.getByText(/AI-powered analysis/i)).toBeInTheDocument();
    expect(screen.queryByText(/mock_haut/i)).not.toBeInTheDocument();

    // Default view: top-5 ranked metrics visible.  Oiliness (high) and
    // hydration (low — concerning) should always make the cut.
    const grid = screen.getByTestId("profile-grid");
    expect(within(grid).getByText("Hydration")).toBeInTheDocument();
    expect(within(grid).getByText("Oiliness")).toBeInTheDocument();

    // Profile is not the default tab, so activate it before reaching
    // for the Show-more button (which is hidden from the a11y tree
    // when its panel is inactive).
    fireEvent.click(screen.getByRole("tab", { name: /^Profile$/i }));
    const showMore = screen.getByRole("button", { name: /show \d+ more/i });
    fireEvent.click(showMore);
    expect(within(grid).getByText("Texture")).toBeInTheDocument();
    expect(within(grid).getByText("Fine lines")).toBeInTheDocument();

    // Oil control is the top focus because oiliness is high.
    const focusChips = screen.getByTestId("focus-areas");
    expect(within(focusChips).getByText("Oil control")).toBeInTheDocument();
  });

  it("falls back to Basic analysis when provider is legacy", async () => {
    vi.spyOn(api, "details").mockResolvedValue({
      ...baseDetails,
      ai_metrics: {
        provider: "legacy",
        confidence_score: 0.55,
      },
    });

    renderResults();

    await screen.findByText(/Basic analysis/i);

    // Confidence tier maps 0.55 → Medium.
    expect(screen.getByText(/Confidence: Medium/i)).toBeInTheDocument();

    // No extended metric rows in legacy mode.
    const grid = screen.getByTestId("profile-grid");
    expect(within(grid).queryByText("Oiliness")).not.toBeInTheDocument();
    expect(within(grid).queryByText("Breakouts")).not.toBeInTheDocument();
    expect(within(grid).queryByText("Texture")).not.toBeInTheDocument();

    // 4 legacy rows fit inside the default top-5 slice, so no Show more.
    expect(screen.queryByRole("button", { name: /show \d+ more/i })).not.toBeInTheDocument();
  });

  it("renders cleanly when ai_metrics is omitted (old scan)", async () => {
    vi.spyOn(api, "details").mockResolvedValue(baseDetails);

    renderResults();

    await screen.findByText(/Basic analysis/i);

    // Legacy features still drive a useful profile.
    const grid = screen.getByTestId("profile-grid");
    expect(within(grid).getByText("Hydration")).toBeInTheDocument();
    expect(within(grid).getByText("Pores")).toBeInTheDocument();

    // Focus areas always emit at least two chips.
    const focusChips = screen.getByTestId("focus-areas");
    expect(focusChips.children.length).toBeGreaterThanOrEqual(2);

    // The Recommended block now lives inside the Picks tab — activate
    // it so the heading is part of the accessibility tree.
    fireEvent.click(screen.getByRole("tab", { name: /^Picks$/i }));
    expect(screen.getByRole("heading", { name: /^Recommended$/ })).toBeInTheDocument();
  });

  it("surfaces a recovery path when details fail to load", async () => {
    vi.spyOn(api, "details").mockRejectedValue(new Error("boom"));
    renderResults();
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
