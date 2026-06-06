/**
 * Pure mappers between UI quiz vocabulary and legacy backend `Concern` / `SkinType`.
 * Deterministic (sorted, deduped) output; unknown UI values are silently dropped.
 */
import type { Concern, SkinType } from "../types";
import type { SkinConcern, SkinSensitivity, SkinTypeAnswer } from "../types/quiz";

// fine_lines → pigmentation is a deliberate proxy (no anti-ageing tag in seed catalogue).
const UI_CONCERN_TO_LEGACY: Record<SkinConcern, readonly Concern[]> = {
  acne_breakouts: ["oiliness", "pores"],
  redness: ["redness"],
  dryness: ["hydration"],
  oiliness: ["oiliness"],
  pigmentation_dark_spots: ["pigmentation"],
  fine_lines: ["pigmentation"],
  large_pores: ["pores"],
};

export function mapConcernsToLegacy(uiConcerns: SkinConcern[] | undefined): Concern[] {
  if (!uiConcerns || uiConcerns.length === 0) return [];
  const out = new Set<Concern>();
  for (const c of uiConcerns) {
    const targets = UI_CONCERN_TO_LEGACY[c];
    if (!targets) continue;
    for (const t of targets) out.add(t);
  }
  return Array.from(out).sort();
}

/** Only "very_sensitive" flips the legacy boolean; mid-level handled via raw_sensitivity. */
export function mapSensitivityToLegacyBool(s: SkinSensitivity | undefined): boolean {
  return s === "very_sensitive";
}

/** "not_sure" → undefined so the backend treats it as "use AI only". */
export function mapSkinTypeToLegacy(s: SkinTypeAnswer | undefined): SkinType | undefined {
  if (!s || s === "not_sure") return undefined;
  return s;
}
