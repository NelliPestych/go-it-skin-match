/**
 * Unit coverage for the AI Skin Report pure helpers.  These functions
 * encode the wording rules and prioritization that make the report
 * feel calibrated and brand-safe, so the tests intentionally pin:
 *
 *   - the confidence threshold boundaries (a 0.74 vs 0.75 slip would
 *     be invisible in QA but very visible in the badge),
 *   - the provider label, since leaking `mock_haut` into the UI is
 *     the kind of bug that ships unnoticed,
 *   - the legacy fallback path, which is the silent majority of
 *     historical scans.
 */
import { describe, expect, it } from "vitest";

import type { AIMetricsView, SkinFeatures } from "../types";

import {
  buildFocusAreas,
  buildInsights,
  buildSkinProfile,
  confidenceLabel,
  DEFAULT_PROFILE_METRIC_COUNT,
  displayProviderLabel,
  hasExtendedMetrics,
  levelToPercent,
  recommendationTagline,
} from "./aiReport";

const baseFeatures: SkinFeatures = {
  skin_type: "combination",
  redness_level: "low",
  hydration_level: "medium",
  pigmentation_level: "low",
  pores_score: 0.4,
  confidence_score: 0.8,
};

const fullMetrics: AIMetricsView = {
  provider: "mock_haut",
  confidence_score: 0.82,
  oiliness: "high",
  acne: "medium",
  fine_lines: "low",
  texture: "medium",
};

describe("confidenceLabel", () => {
  it("maps 0.75 exactly to High", () => {
    expect(confidenceLabel(0.75)).toBe("High");
  });

  it("maps just below 0.75 to Medium", () => {
    expect(confidenceLabel(0.749)).toBe("Medium");
  });

  it("maps 0.5 exactly to Medium", () => {
    expect(confidenceLabel(0.5)).toBe("Medium");
  });

  it("maps just below 0.5 to Low", () => {
    expect(confidenceLabel(0.499)).toBe("Low");
  });

  it("defaults to Low when score is undefined / NaN", () => {
    expect(confidenceLabel(undefined)).toBe("Low");
    expect(confidenceLabel(Number.NaN)).toBe("Low");
  });
});

describe("displayProviderLabel", () => {
  it("returns Basic analysis when ai_metrics is missing", () => {
    expect(displayProviderLabel(null)).toBe("Basic analysis");
    expect(displayProviderLabel(undefined)).toBe("Basic analysis");
  });

  it("returns Basic analysis for the legacy provider sentinel", () => {
    expect(
      displayProviderLabel({ provider: "legacy", confidence_score: 0.8 }),
    ).toBe("Basic analysis");
  });

  it("returns AI-powered analysis for any non-legacy provider", () => {
    expect(displayProviderLabel(fullMetrics)).toBe("AI-powered analysis");
    expect(
      displayProviderLabel({ provider: "haut_ai", confidence_score: 0.8 }),
    ).toBe("AI-powered analysis");
  });

  it("never leaks the raw provider id back to the UI", () => {
    const label = displayProviderLabel(fullMetrics);
    expect(label).not.toContain("mock");
    expect(label).not.toContain("haut");
  });
});

describe("hasExtendedMetrics", () => {
  it("is true only for a non-legacy provider", () => {
    expect(hasExtendedMetrics(fullMetrics)).toBe(true);
    expect(hasExtendedMetrics(null)).toBe(false);
    expect(hasExtendedMetrics({ provider: "legacy", confidence_score: 0.5 })).toBe(
      false,
    );
  });
});

describe("levelToPercent", () => {
  it("maps levels onto fixed buckets", () => {
    expect(levelToPercent("low")).toBe(30);
    expect(levelToPercent("medium")).toBe(60);
    expect(levelToPercent("high")).toBe(85);
  });

  it("defaults to 50 for missing readings", () => {
    expect(levelToPercent(undefined)).toBe(50);
    expect(levelToPercent(null)).toBe(50);
  });
});

describe("buildSkinProfile", () => {
  it("emits exactly the 4 legacy rows when metrics are missing", () => {
    const rows = buildSkinProfile(baseFeatures, null);
    expect(rows.map((r) => r.id).sort()).toEqual([
      "hydration",
      "pigmentation",
      "pores",
      "redness",
    ]);
  });

  it("emits exactly the 4 legacy rows when provider is legacy", () => {
    const rows = buildSkinProfile(baseFeatures, {
      provider: "legacy",
      confidence_score: 0.7,
      // Even if the legacy sidecar somehow had extended fields, we
      // refuse to render them — provider is the source of truth.
      oiliness: "high",
    });
    expect(rows.map((r) => r.id).sort()).toEqual([
      "hydration",
      "pigmentation",
      "pores",
      "redness",
    ]);
  });

  it("appends extended rows for a real AI provider", () => {
    const rows = buildSkinProfile(baseFeatures, fullMetrics);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain("oiliness");
    expect(ids).toContain("acne");
    expect(ids).toContain("fine_lines");
    expect(ids).toContain("texture");
  });

  it("skips extended rows that the provider didn't fill in", () => {
    const rows = buildSkinProfile(baseFeatures, {
      provider: "mock_haut",
      confidence_score: 0.7,
      oiliness: "high",
      // acne / fine_lines / texture intentionally undefined
    });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain("oiliness");
    expect(ids).not.toContain("acne");
    expect(ids).not.toContain("fine_lines");
    expect(ids).not.toContain("texture");
  });

  it("maps pores_score to a percent and a friendly word", () => {
    const visible = buildSkinProfile({ ...baseFeatures, pores_score: 0.75 }, null);
    const refined = buildSkinProfile({ ...baseFeatures, pores_score: 0.5 }, null);
    const smooth = buildSkinProfile({ ...baseFeatures, pores_score: 0.2 }, null);
    expect(visible.find((r) => r.id === "pores")?.valueLabel).toBe("Visible");
    expect(refined.find((r) => r.id === "pores")?.valueLabel).toBe("Refined");
    expect(smooth.find((r) => r.id === "pores")?.valueLabel).toBe("Smooth");
  });

  it("ranks concerning readings above neutral ones", () => {
    // Hydration low + acne high should outrank quiet legacy rows
    // (low redness / low pigmentation / smooth pores) so they appear
    // in the default top-5 slice.
    const rows = buildSkinProfile(
      { ...baseFeatures, hydration_level: "low" },
      { ...fullMetrics, acne: "high", oiliness: "low", texture: "low", fine_lines: "low" },
    );
    const topFive = rows.slice(0, DEFAULT_PROFILE_METRIC_COUNT).map((r) => r.id);
    expect(topFive).toContain("hydration");
    expect(topFive).toContain("acne");
  });

  it("keeps hydration in the top-5 even when its reading is mid-range", () => {
    // Hydration is the most universally relevant skincare signal, so
    // users expect to see it even when nothing else is alarming.
    const rows = buildSkinProfile(
      { ...baseFeatures, hydration_level: "medium" },
      {
        ...fullMetrics,
        oiliness: "high",
        acne: "high",
        texture: "high",
        fine_lines: "high",
      },
    );
    const topFive = rows.slice(0, DEFAULT_PROFILE_METRIC_COUNT).map((r) => r.id);
    expect(topFive).toContain("hydration");
  });
});

describe("buildFocusAreas", () => {
  it("prioritizes oil control when oiliness is high", () => {
    const areas = buildFocusAreas(baseFeatures, fullMetrics);
    expect(areas[0]).toBe("Oil control");
  });

  it("surfaces hydration support when hydration is low", () => {
    const areas = buildFocusAreas(
      { ...baseFeatures, hydration_level: "low" },
      null,
    );
    expect(areas).toContain("Hydration support");
  });

  it("caps the output at 4 areas", () => {
    const areas = buildFocusAreas(
      {
        ...baseFeatures,
        hydration_level: "low",
        redness_level: "high",
        pigmentation_level: "high",
        pores_score: 0.8,
      },
      { ...fullMetrics, oiliness: "high", acne: "high", texture: "high", fine_lines: "high" },
    );
    expect(areas.length).toBeLessThanOrEqual(4);
  });

  it("never returns fewer than 2 areas, even for flat signals", () => {
    const areas = buildFocusAreas(
      {
        skin_type: "normal",
        redness_level: "low",
        hydration_level: "high",
        pigmentation_level: "low",
        pores_score: 0.2,
        confidence_score: 0.9,
      },
      null,
    );
    expect(areas.length).toBeGreaterThanOrEqual(2);
  });
});

describe("buildInsights", () => {
  it("returns at least two cautious, hedged lines", () => {
    const insights = buildInsights(baseFeatures, fullMetrics);
    expect(insights.length).toBeGreaterThanOrEqual(2);
    for (const line of insights) {
      // Cautious wording — none of these clinical phrases should
      // ever leak into the UI.
      expect(line.toLowerCase()).not.toContain("you have");
      expect(line.toLowerCase()).not.toContain("diagnose");
    }
  });

  it("caps at three insights", () => {
    const insights = buildInsights(
      {
        ...baseFeatures,
        hydration_level: "low",
        redness_level: "high",
        pigmentation_level: "high",
        pores_score: 0.8,
      },
      { ...fullMetrics, oiliness: "high", acne: "high", texture: "high" },
    );
    expect(insights.length).toBeLessThanOrEqual(3);
  });
});

describe("recommendationTagline", () => {
  it("falls back to the curated copy when no focus areas exist", () => {
    expect(recommendationTagline([])).toBe("Curated for your specific profile");
  });

  it("composes a tagline from the top two focus areas", () => {
    expect(recommendationTagline(["Oil control", "Hydration support"])).toBe(
      "Recommended for oil control and hydration support",
    );
  });

  it("handles a single focus area", () => {
    expect(recommendationTagline(["Hydration support"])).toBe(
      "Recommended for hydration support",
    );
  });
});
