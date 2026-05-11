/**
 * Pure-function coverage for the UI ↔ legacy mappers.
 *
 * These three functions are the entire contract between the rich
 * 7-question UI vocabulary and the backend's pre-existing Concern /
 * SkinType enums. If they regress, the recommendation engine
 * receives wrong (or missing) signals and the diploma demo silently
 * degrades. The tests are kept minimal but exhaustive — one row per
 * mapping rule documented in `quizMapping.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  mapConcernsToLegacy,
  mapSensitivityToLegacyBool,
  mapSkinTypeToLegacy,
} from "./quizMapping";
import type { SkinConcern } from "../types/quiz";

describe("mapConcernsToLegacy", () => {
  it("returns an empty array for undefined / empty input", () => {
    expect(mapConcernsToLegacy(undefined)).toEqual([]);
    expect(mapConcernsToLegacy([])).toEqual([]);
  });

  it.each<[SkinConcern, string[]]>([
    ["acne_breakouts", ["oiliness", "pores"]],
    ["redness", ["redness"]],
    ["dryness", ["hydration"]],
    ["oiliness", ["oiliness"]],
    ["pigmentation_dark_spots", ["pigmentation"]],
    ["fine_lines", ["pigmentation"]],
    ["large_pores", ["pores"]],
  ])("maps %s → %j", (ui, legacy) => {
    expect(mapConcernsToLegacy([ui])).toEqual(legacy);
  });

  it("deduplicates legacy values when two UI concerns project to the same legacy value", () => {
    // both pigmentation_dark_spots and fine_lines target "pigmentation"
    expect(
      mapConcernsToLegacy(["pigmentation_dark_spots", "fine_lines"]),
    ).toEqual(["pigmentation"]);
  });

  it("sorts the legacy output deterministically", () => {
    // input order is reversed wrt the alphabetical legacy order
    expect(mapConcernsToLegacy(["redness", "dryness"])).toEqual([
      "hydration",
      "redness",
    ]);
  });

  it("silently drops unknown UI values (forward compat)", () => {
    expect(
      mapConcernsToLegacy(["acne_breakouts", "unknown_future_value" as SkinConcern]),
    ).toEqual(["oiliness", "pores"]);
  });

  it("acne_breakouts unions correctly with explicit oiliness (no double-count)", () => {
    expect(mapConcernsToLegacy(["acne_breakouts", "oiliness"])).toEqual([
      "oiliness",
      "pores",
    ]);
  });
});

describe("mapSensitivityToLegacyBool", () => {
  it("flips true ONLY for very_sensitive", () => {
    expect(mapSensitivityToLegacyBool("very_sensitive")).toBe(true);
    expect(mapSensitivityToLegacyBool("sometimes_reacts")).toBe(false);
    expect(mapSensitivityToLegacyBool("not_sensitive")).toBe(false);
    expect(mapSensitivityToLegacyBool(undefined)).toBe(false);
  });
});

describe("mapSkinTypeToLegacy", () => {
  it("collapses 'not_sure' to undefined so the field is omitted from the wire payload", () => {
    expect(mapSkinTypeToLegacy("not_sure")).toBeUndefined();
    expect(mapSkinTypeToLegacy(undefined)).toBeUndefined();
  });

  it("passes through the four legacy SkinType values verbatim", () => {
    expect(mapSkinTypeToLegacy("dry")).toBe("dry");
    expect(mapSkinTypeToLegacy("oily")).toBe("oily");
    expect(mapSkinTypeToLegacy("combination")).toBe("combination");
    expect(mapSkinTypeToLegacy("normal")).toBe("normal");
  });
});
