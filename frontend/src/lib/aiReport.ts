/**
 * Pure helpers that translate the AI Skin Report into user-facing UI
 * primitives.  Kept out of the React component so the wording rules,
 * thresholds and prioritization can be unit-tested in isolation.
 *
 * Source signals come from two places:
 *
 *   - `SkinFeatures` (legacy 6-field shape) — always present on a
 *     details response.  Provides skin_type / hydration / redness /
 *     pigmentation / pores / confidence.
 *
 *   - `AIMetricsView` (optional sidecar) — when the provider returned
 *     normalized metrics, adds oiliness / acne / fine_lines / texture
 *     plus its own confidence_score and a provider stamp.  When the
 *     provider is `"legacy"` (or the sidecar is absent entirely),
 *     these extended metrics are unavailable and the UI falls back
 *     to a basic profile derived solely from the legacy fields.
 *
 * Wording rules (intentionally cautious, never diagnostic):
 *   - "may", "suggests", "can help", "support"
 *   - never names a condition: "Your skin may benefit from
 *     lightweight hydration", not "You have dehydrated skin".
 *   - never leaks internal provider names (mock_haut, haut_ai).
 */
import type { AIMetricsView, Level, SkinFeatures } from "../types";

/* ── Confidence ──────────────────────────────────────────────────── */

export type ConfidenceTier = "High" | "Medium" | "Low";

/** Map a 0..1 confidence score to a friendly tier.
 *
 *  Thresholds match the product spec exactly:
 *    >= 0.75 → High
 *    >= 0.50 → Medium
 *    <  0.50 → Low
 *  Anything `NaN` / `undefined` collapses to "Low" so the badge is
 *  always renderable. */
export function confidenceLabel(score: number | undefined | null): ConfidenceTier {
  if (typeof score !== "number" || Number.isNaN(score)) return "Low";
  if (score >= 0.75) return "High";
  if (score >= 0.5) return "Medium";
  return "Low";
}

/* ── Provider label ──────────────────────────────────────────────── */

/** User-facing label for the analysis source.
 *
 *  Never returns the raw provider id (`mock_haut`, `haut_ai`,
 *  `local`).  Treat anything other than the explicit `"legacy"`
 *  sentinel as a real AI provider — that way new providers added
 *  later automatically render as "AI-powered analysis" without a
 *  frontend change. */
export function displayProviderLabel(
  metrics: AIMetricsView | null | undefined,
): "AI-powered analysis" | "Basic analysis" {
  if (!metrics || metrics.provider === "legacy") return "Basic analysis";
  return "AI-powered analysis";
}

/** True when extended AI metrics (oiliness / acne / fine_lines /
 *  texture) are available for display.  Centralized so the component
 *  and the focus-area / insight generators stay in sync. */
export function hasExtendedMetrics(
  metrics: AIMetricsView | null | undefined,
): boolean {
  return !!metrics && metrics.provider !== "legacy";
}

/* ── Metric → percent ────────────────────────────────────────────── */

/** Map a categorical level to a meter percentage.
 *
 *  Used by the skin profile bars; kept consistent with the prior
 *  ResultsPage mapping (low 30 / medium 60 / high 85) so existing
 *  scans don't visually jump after the redesign.  Defaults to 50% so
 *  a missing reading reads as "neutral" rather than alarming. */
export function levelToPercent(level: Level | null | undefined): number {
  if (level === "high") return 85;
  if (level === "medium") return 60;
  if (level === "low") return 30;
  return 50;
}

/* ── Skin profile ────────────────────────────────────────────────── */

export interface ProfileMetric {
  /** Stable id — useful for React keys and test queries. */
  id:
    | "hydration"
    | "redness"
    | "pigmentation"
    | "pores"
    | "oiliness"
    | "acne"
    | "fine_lines"
    | "texture";
  /** Human label, e.g. "Hydration". */
  label: string;
  /** Compact word for the right-hand side of the row, e.g. "Medium". */
  valueLabel: string;
  /** 0..100 for the meter fill. */
  percent: number;
  /** Tint hint for the meter (small visual variety, no semantics). */
  tone: "rose" | "mint" | "cream" | "lavender" | "sky" | "peach";
  /** Salience: higher = more likely a "concerning" reading we want to
   *  surface first.  Used to rank metrics so the user sees the most
   *  relevant rows in the default view without scrolling. */
  priority: number;
}

const TONE_BY_ID: Record<ProfileMetric["id"], ProfileMetric["tone"]> = {
  hydration: "sky",
  redness: "rose",
  pigmentation: "cream",
  pores: "peach",
  oiliness: "mint",
  acne: "rose",
  fine_lines: "lavender",
  texture: "peach",
};

function poresPercent(score: number | undefined | null): number {
  if (typeof score !== "number" || Number.isNaN(score)) return 50;
  const clamped = Math.max(0, Math.min(1, score));
  return Math.round(clamped * 100);
}

function poresValueLabel(score: number | undefined | null): string {
  if (typeof score !== "number" || Number.isNaN(score)) return "—";
  if (score >= 0.7) return "Visible";
  if (score >= 0.4) return "Refined";
  return "Smooth";
}

function levelWord(level: Level | null | undefined): string {
  if (level === "high") return "High";
  if (level === "medium") return "Medium";
  if (level === "low") return "Low";
  return "—";
}

/** Per-metric priority scoring.  Higher = more likely "concerning" /
 *  more informative for the user, so we want it surfaced first in the
 *  default view.  Calibrated so a single very strong reading (e.g.
 *  high redness) always beats anything that's just "medium".
 *
 *  Hydration is the one exception: hydration always shows in the
 *  top-5 because it's the most universally relevant skincare signal
 *  even when the reading is mid-range — users expect it. */
function metricPriority(
  id: ProfileMetric["id"],
  raw: Level | number | null | undefined,
): number {
  if (id === "pores") {
    const score = typeof raw === "number" ? raw : 0.4;
    if (score >= 0.7) return 9;
    if (score >= 0.4) return 4;
    return 1;
  }
  const level = (raw as Level | null | undefined) ?? "low";
  const concerningHigh: Partial<Record<ProfileMetric["id"], number>> = {
    redness: 10,
    acne: 10,
    pigmentation: 9,
    oiliness: 8,
    texture: 7,
    fine_lines: 6,
    hydration: 9, // concern is *low* hydration — handled below
  };
  if (id === "hydration") {
    // Inverted: low hydration is the concerning state, high is great.
    // Floor of 5 keeps hydration in the top tier regardless.
    if (level === "low") return 10;
    if (level === "medium") return 6;
    return 5;
  }
  if (level === "high") return concerningHigh[id] ?? 5;
  if (level === "medium") return 3;
  return 0;
}

/** Build the ordered list of metric cards for the skin profile grid.
 *
 *  Legacy metrics (hydration / redness / pigmentation / pores) come
 *  from `SkinFeatures` and are always present.  Extended metrics
 *  (oiliness / acne / fine_lines / texture) are appended only when
 *  the provider supplied them — when the sidecar is missing or its
 *  `provider === "legacy"`, those rows are hidden so we don't show
 *  empty placeholders.
 *
 *  Rows are returned sorted by descending priority so the page can
 *  slice the first N for the default view and put the rest behind a
 *  "Show more" toggle. */
export function buildSkinProfile(
  features: SkinFeatures,
  metrics: AIMetricsView | null | undefined,
): ProfileMetric[] {
  const rows: ProfileMetric[] = [
    {
      id: "hydration",
      label: "Hydration",
      valueLabel: levelWord(features.hydration_level),
      percent: levelToPercent(features.hydration_level),
      tone: TONE_BY_ID.hydration,
      priority: metricPriority("hydration", features.hydration_level),
    },
    {
      id: "redness",
      label: "Redness",
      valueLabel: levelWord(features.redness_level),
      percent: levelToPercent(features.redness_level),
      tone: TONE_BY_ID.redness,
      priority: metricPriority("redness", features.redness_level),
    },
    {
      id: "pigmentation",
      label: "Pigmentation",
      valueLabel: levelWord(features.pigmentation_level),
      percent: levelToPercent(features.pigmentation_level),
      tone: TONE_BY_ID.pigmentation,
      priority: metricPriority("pigmentation", features.pigmentation_level),
    },
    {
      id: "pores",
      label: "Pores",
      valueLabel: poresValueLabel(features.pores_score),
      percent: poresPercent(features.pores_score),
      tone: TONE_BY_ID.pores,
      priority: metricPriority("pores", features.pores_score),
    },
  ];

  if (hasExtendedMetrics(metrics)) {
    const m = metrics as AIMetricsView;
    if (m.oiliness)
      rows.push({
        id: "oiliness",
        label: "Oiliness",
        valueLabel: levelWord(m.oiliness),
        percent: levelToPercent(m.oiliness),
        tone: TONE_BY_ID.oiliness,
        priority: metricPriority("oiliness", m.oiliness),
      });
    if (m.acne)
      rows.push({
        id: "acne",
        label: "Breakouts",
        valueLabel: levelWord(m.acne),
        percent: levelToPercent(m.acne),
        tone: TONE_BY_ID.acne,
        priority: metricPriority("acne", m.acne),
      });
    if (m.fine_lines)
      rows.push({
        id: "fine_lines",
        label: "Fine lines",
        valueLabel: levelWord(m.fine_lines),
        percent: levelToPercent(m.fine_lines),
        tone: TONE_BY_ID.fine_lines,
        priority: metricPriority("fine_lines", m.fine_lines),
      });
    if (m.texture)
      rows.push({
        id: "texture",
        label: "Texture",
        valueLabel: levelWord(m.texture),
        percent: levelToPercent(m.texture),
        tone: TONE_BY_ID.texture,
        priority: metricPriority("texture", m.texture),
      });
  }

  // Sort by descending priority.  Stable on ties so the legacy block
  // keeps a familiar order when nothing dominates.
  return rows
    .map((r, idx) => ({ r, idx }))
    .sort((a, b) => b.r.priority - a.r.priority || a.idx - b.idx)
    .map(({ r }) => r);
}

/** Default count of metric rows shown in the collapsed view.  Five
 *  fits 3 rows of the 2-col grid (with one orphan) and keeps the
 *  page from feeling like a dashboard. */
export const DEFAULT_PROFILE_METRIC_COUNT = 5;

/* ── Focus areas ─────────────────────────────────────────────────── */

export type FocusArea =
  | "Oil control"
  | "Hydration support"
  | "Barrier support"
  | "Texture smoothing"
  | "Pore care"
  | "Breakout support"
  | "Tone balance"
  | "Daily SPF support";

interface ScoredFocus {
  area: FocusArea;
  score: number;
}

const LEVEL_WEIGHT: Record<Level, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/** Pick 2–4 actionable focus areas, ranked by signal strength.
 *
 *  Combines legacy and extended metrics so the basic-analysis path
 *  still produces useful focus areas.  When the user has no strong
 *  signals at all, we still emit at least two areas (skin_type-aware
 *  defaults) so the section is never empty. */
export function buildFocusAreas(
  features: SkinFeatures,
  metrics: AIMetricsView | null | undefined,
): FocusArea[] {
  const candidates: ScoredFocus[] = [];

  // Legacy-derived candidates.
  if (features.hydration_level === "low") candidates.push({ area: "Hydration support", score: 3 });
  else if (features.hydration_level === "medium") candidates.push({ area: "Hydration support", score: 1 });

  if (features.redness_level === "high") candidates.push({ area: "Barrier support", score: 3 });
  else if (features.redness_level === "medium") candidates.push({ area: "Barrier support", score: 1 });

  if (features.pigmentation_level === "high") candidates.push({ area: "Tone balance", score: 3 });
  else if (features.pigmentation_level === "medium") candidates.push({ area: "Tone balance", score: 1 });

  if (typeof features.pores_score === "number") {
    if (features.pores_score >= 0.7) candidates.push({ area: "Pore care", score: 3 });
    else if (features.pores_score >= 0.4) candidates.push({ area: "Pore care", score: 1 });
  }

  if (features.skin_type === "oily") candidates.push({ area: "Oil control", score: 2 });
  if (features.skin_type === "dry") candidates.push({ area: "Hydration support", score: 2 });

  // Extended-metric candidates.
  if (hasExtendedMetrics(metrics)) {
    const m = metrics as AIMetricsView;
    if (m.oiliness) candidates.push({ area: "Oil control", score: LEVEL_WEIGHT[m.oiliness] + 1 });
    if (m.acne) candidates.push({ area: "Breakout support", score: LEVEL_WEIGHT[m.acne] + 1 });
    if (m.texture) candidates.push({ area: "Texture smoothing", score: LEVEL_WEIGHT[m.texture] });
    if (m.fine_lines && LEVEL_WEIGHT[m.fine_lines] >= 1)
      candidates.push({ area: "Texture smoothing", score: LEVEL_WEIGHT[m.fine_lines] });
  }

  // Always keep SPF support on the table — universal recommendation —
  // but at a low priority so it only surfaces when there's room.
  candidates.push({ area: "Daily SPF support", score: 0.5 });

  // Collapse duplicates by max score, then rank.
  const byArea = new Map<FocusArea, number>();
  for (const { area, score } of candidates) {
    const prev = byArea.get(area);
    if (prev === undefined || score > prev) byArea.set(area, score);
  }

  const ranked: FocusArea[] = Array.from(byArea.entries())
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([area]) => area);

  // Cap at 4, guarantee at least 2 so the chip row never collapses.
  const top = ranked.slice(0, 4);
  if (top.length >= 2) return top;

  // Fallback floor when signals are all flat — surface neutral, safe
  // areas that apply broadly.
  const fallback: FocusArea[] = ["Hydration support", "Daily SPF support"];
  for (const area of fallback) if (!top.includes(area)) top.push(area);
  return top.slice(0, Math.max(2, top.length));
}

/* ── Personalized insights ───────────────────────────────────────── */

/** Short, reassuring sentences (2–3) tailored to the user's metrics.
 *
 *  Wording rules: never diagnostic, never medical, always hedged
 *  ("may", "suggests", "can help").  Insights are *additive* to the
 *  metric grid — they translate numbers into a couple of plain-
 *  English takeaways, they don't restate every reading. */
export function buildInsights(
  features: SkinFeatures,
  metrics: AIMetricsView | null | undefined,
): string[] {
  const out: string[] = [];
  const ext = hasExtendedMetrics(metrics);
  const m = ext ? (metrics as AIMetricsView) : null;

  // 1. Oil + hydration combo (very common for combination / oily skin)
  if (m?.oiliness === "high" && features.hydration_level === "low") {
    out.push(
      "A pairing of lightweight hydration and gentle oil-balancing care can help your skin feel comfortable all day.",
    );
  } else if (m?.oiliness === "high") {
    out.push(
      "A weightless, oil-balancing routine can help your complexion feel fresh and softly luminous.",
    );
  } else if (features.hydration_level === "low") {
    out.push(
      "Layering hydrating, dewy formulas morning and night can help your skin look plump and quietly glowing.",
    );
  }

  // 2. Texture / fine lines / pores
  if (m?.texture === "high" || m?.fine_lines === "high") {
    out.push(
      "Your scan suggests a hint of uneven texture, and gentle weekly exfoliation can help reveal a smoother, softer finish.",
    );
  } else if (features.pores_score >= 0.6) {
    out.push(
      "A pore-refining step a couple of times a week can support a softer, more refined-looking surface.",
    );
  }

  // 3. Redness / barrier
  if (features.redness_level === "high") {
    out.push(
      "Soothing, fragrance-free formulas can be a comforting companion for a calmer, more even-looking complexion.",
    );
  }

  // 4. Pigmentation / SPF — universal nudge
  if (features.pigmentation_level === "high") {
    out.push(
      "Daily SPF is one of the kindest things you can do for an even, radiant complexion — every morning, no exceptions.",
    );
  } else if (out.length < 2) {
    out.push(
      "A little daily SPF goes a long way toward keeping your complexion even, glowing and protected.",
    );
  }

  // 5. Acne / breakout copy
  if (m?.acne === "high") {
    out.push(
      "Gentle, targeted care can be a soothing companion through breakout-prone moments — patience matters more than pressure.",
    );
  }

  // Trim to 3, dedupe.
  const seen = new Set<string>();
  const final: string[] = [];
  for (const line of out) {
    if (!seen.has(line)) {
      seen.add(line);
      final.push(line);
    }
    if (final.length >= 3) break;
  }

  // Floor: always at least 2 lines so the section doesn't look empty.
  if (final.length < 2) {
    const filler =
      "Consistency is the quiet secret of great skin — small daily rituals tend to add up to a softer, brighter complexion.";
    if (!seen.has(filler)) final.push(filler);
  }

  return final;
}

/* ── Recommendation tagline ──────────────────────────────────────── */

/** Build a short tagline connecting recommendations to AI findings.
 *
 *  Used under the "Recommended" section header — surfaces the top 2
 *  focus areas the products are addressing so the user sees the
 *  thread between the scan and the suggestions. */
export function recommendationTagline(focusAreas: FocusArea[]): string {
  if (focusAreas.length === 0) return "Curated for your specific profile";
  const lead = focusAreas.slice(0, 2).map((a) => a.toLowerCase());
  if (lead.length === 1) return `Recommended for ${lead[0]}`;
  return `Recommended for ${lead[0]} and ${lead[1]}`;
}
