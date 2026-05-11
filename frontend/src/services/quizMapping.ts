/**
 * Mapping layer between the rich UI quiz vocabulary and the legacy
 * backend Pydantic enums (`SkinType`, `Concern`).
 *
 * Why a separate module:
 * The UI is free to evolve its labels and option ids without churning
 * the backend contract. This module is the *only* place that knows
 * about both vocabularies; everywhere else in the frontend (config,
 * provider, page) speaks UI-types, and the API service speaks
 * legacy-types. AnalyzingPage calls these mappers immediately before
 * `api.submitQuiz(...)`.
 *
 * Design rules (intentional, deterministic):
 * - **Pure functions only** — no side effects, easy to test in
 *   isolation and reuse server-side later if needed.
 * - **Deterministic output order** — `mapConcernsToLegacy` returns a
 *   stable, sorted, deduplicated array so two equivalent UI selections
 *   always produce the same wire payload (helps cache keys + tests).
 * - **No throwing on unknown values** — unknown UI concerns are simply
 *   dropped. This is by design: future versions can add concerns to
 *   the UI without breaking older backends.
 */
import type { Concern, SkinType } from "../types";
import type { SkinConcern, SkinSensitivity, SkinTypeAnswer } from "../types/quiz";

/**
 * UI skin-concern → set of legacy backend `Concern` values used by
 * the recommendation engine.
 *
 * Rationale per row:
 * - acne_breakouts → oiliness + pores
 *   The seed catalogue tags acne-relevant products (salicylic acid /
 *   niacinamide cleansers + serums) with these two concerns, so this
 *   mapping makes acne-conscious users surface the right items via
 *   the existing scorer without any backend rule changes.
 * - dryness → hydration
 *   Same skin signal, opposite framing.
 * - pigmentation_dark_spots → pigmentation, large_pores → pores
 *   1:1 rename.
 * - fine_lines → pigmentation
 *   No dedicated "anti-ageing" tag exists in the seed catalogue. The
 *   antioxidant / vitamin-C products tagged with "pigmentation" are
 *   the closest fit (they target uneven tone + fine lines together).
 *   This is documented here so the diploma defence can answer the
 *   "why does fine_lines map there?" question precisely.
 */
const UI_CONCERN_TO_LEGACY: Record<SkinConcern, readonly Concern[]> = {
  acne_breakouts: ["oiliness", "pores"],
  redness: ["redness"],
  dryness: ["hydration"],
  oiliness: ["oiliness"],
  pigmentation_dark_spots: ["pigmentation"],
  fine_lines: ["pigmentation"],
  large_pores: ["pores"],
};

/**
 * Project the rich UI concerns set onto the legacy `Concern[]` the
 * backend's `RecommendationEngine.score()` already understands.
 * Deduplicated + sorted for deterministic output.
 */
export function mapConcernsToLegacy(uiConcerns: SkinConcern[] | undefined): Concern[] {
  if (!uiConcerns || uiConcerns.length === 0) return [];
  const out = new Set<Concern>();
  for (const c of uiConcerns) {
    const targets = UI_CONCERN_TO_LEGACY[c];
    if (!targets) continue; // unknown UI value — ignored on purpose
    for (const t of targets) out.add(t);
  }
  return Array.from(out).sort();
}

/**
 * The backend's legacy `sensitivity` field is a boolean. We collapse
 * the 3-level UI sensitivity to it conservatively: only the topmost
 * "very_sensitive" answer flips the legacy flag, since that's the
 * level that should actively avoid harsher actives. Mid-level
 * ("sometimes_reacts") still gets nuanced handling via the new
 * `raw_sensitivity` field on the payload.
 */
export function mapSensitivityToLegacyBool(s: SkinSensitivity | undefined): boolean {
  return s === "very_sensitive";
}

/**
 * The legacy backend `SkinType` enum has no "not sure" option — that's
 * a UI affordance to let undecided users defer to the AI analyser.
 * We translate it to `undefined` so the field is simply omitted from
 * the payload; the backend treats a missing field as "use AI only".
 */
export function mapSkinTypeToLegacy(s: SkinTypeAnswer | undefined): SkinType | undefined {
  if (!s || s === "not_sure") return undefined;
  return s;
}
