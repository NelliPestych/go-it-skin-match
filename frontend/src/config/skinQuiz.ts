/**
 * Skincare quiz config — single source of truth for the 7-question
 * flow rendered by `QuizPage`.
 *
 * Each question writes its answer into one slot of `QuizAnswers`
 * (see `types/quiz.ts`). The route `/quiz/:step` reads from this
 * array by 1-based index so question order can be reshuffled by
 * editing this file alone — no UI changes required.
 *
 * Design notes:
 * - All visible copy lives here (not in the page component).  This
 *   makes it trivial to swap in localised strings later.
 * - `bg` is intentionally a CSS custom property from the existing
 *   palette (var(--rose) / --lavender / --mint / --cream / --sky)
 *   so the new quiz reuses the same colour system as the original
 *   two-question quiz, without introducing new design tokens.
 * - `icon` is an emoji string — same as the legacy quiz cards.
 *   No new image assets, no extra HTTP requests.
 * - Every option `id` MUST be a legal value of the corresponding
 *   per-answer union in `types/quiz.ts`.  The config-validity tests
 *   in Step 6 will enforce this; the per-question const-arrays below
 *   already get TypeScript narrowing thanks to `satisfies`.
 *
 * Why a const array (not a class / not separate modules):
 * The quiz is data, not behaviour.  A flat const array is the easiest
 * shape for both the renderer (`skinQuizQuestions[step - 1]`) and the
 * tests (iterate + assert).  Splitting per-question into modules
 * would add ceremony with no payoff.
 */
import type { QuizQuestion } from "../types/quiz";

export const skinQuizQuestions: QuizQuestion[] = [
  // ── Q1 ─────────────────────────────────────────────────────────
  // Self-perceived skin type. We compare this to the AI-detected
  // type later to compute recommendation confidence.
  {
    id: "skin_type",
    title: "What's your skin type?",
    type: "single",
    required: true,
    options: [
      { id: "dry", label: "Dry", icon: "💧", bg: "var(--cream)" },
      { id: "oily", label: "Oily", icon: "✨", bg: "var(--mint)" },
      { id: "combination", label: "Combination", icon: "🌗", bg: "var(--rose)" },
      { id: "normal", label: "Normal", icon: "🪷", bg: "var(--lavender)" },
      { id: "not_sure", label: "Not sure", icon: "❓", bg: "var(--sky)" },
    ],
  },

  // ── Q2 ─────────────────────────────────────────────────────────
  // Main skin concerns. Multi-select — drives product scoring.
  // Mapped to legacy backend `Concern` values at submit time in
  // `services/quizMapping.ts`.
  {
    id: "concerns",
    title: "Your main concerns?",
    type: "multi",
    required: true,
    options: [
      { id: "acne_breakouts", label: "Acne / breakouts", icon: "🌋", bg: "var(--rose)" },
      { id: "redness", label: "Redness", icon: "🌹", bg: "var(--rose)" },
      { id: "dryness", label: "Dryness", icon: "💧", bg: "var(--cream)" },
      { id: "oiliness", label: "Oiliness", icon: "🧴", bg: "var(--mint)" },
      { id: "pigmentation_dark_spots", label: "Pigmentation", icon: "🎨", bg: "var(--lavender)" },
      { id: "fine_lines", label: "Fine lines", icon: "🪞", bg: "var(--sky)" },
      { id: "large_pores", label: "Large pores", icon: "🔍", bg: "white" },
    ],
  },

  // ── Q3 ─────────────────────────────────────────────────────────
  // Skin sensitivity. Single-select — gates harsh ingredients and
  // boosts gentle / fragrance-free products.
  {
    id: "sensitivity",
    title: "How sensitive is your skin?",
    type: "single",
    required: true,
    options: [
      { id: "very_sensitive", label: "Very sensitive", icon: "🌸", bg: "var(--rose)" },
      { id: "sometimes_reacts", label: "Sometimes reacts", icon: "🌼", bg: "var(--cream)" },
      { id: "not_sensitive", label: "Not sensitive", icon: "🌿", bg: "var(--mint)" },
    ],
  },

  // ── Q4 ─────────────────────────────────────────────────────────
  // Current routine level. Drives plan complexity.
  {
    id: "routine_level",
    title: "Do you use skincare?",
    type: "single",
    required: true,
    options: [
      { id: "regularly", label: "Regularly", icon: "📅", bg: "var(--mint)" },
      { id: "sometimes", label: "Sometimes", icon: "🗓️", bg: "var(--lavender)" },
      { id: "no", label: "No", icon: "🌱", bg: "var(--cream)" },
    ],
  },

  // ── Q5 ─────────────────────────────────────────────────────────
  // Breakout frequency. Boosts acne-safe / non-comedogenic products.
  {
    id: "breakout_frequency",
    title: "How often do you break out?",
    type: "single",
    required: true,
    options: [
      { id: "often", label: "Often", icon: "🌋", bg: "var(--rose)" },
      { id: "sometimes", label: "Sometimes", icon: "🌗", bg: "var(--lavender)" },
      { id: "rarely", label: "Rarely", icon: "🌤️", bg: "var(--sky)" },
      { id: "never", label: "Never", icon: "🌿", bg: "var(--mint)" },
    ],
  },

  // ── Q6 ─────────────────────────────────────────────────────────
  // Daily environment. Adjusts antioxidant / SPF emphasis.
  {
    id: "daily_environment",
    title: "Your daily environment?",
    type: "single",
    required: true,
    options: [
      { id: "urban_pollution", label: "Urban / polluted", icon: "🏙️", bg: "var(--lavender)" },
      { id: "mostly_indoors", label: "Mostly indoors", icon: "🏠", bg: "var(--cream)" },
      { id: "sunny_outdoor", label: "Sunny / outdoor", icon: "☀️", bg: "var(--mint)" },
    ],
  },

  // ── Q7 ─────────────────────────────────────────────────────────
  // Sunscreen usage. Triggers SPF education + ensures SPF in routine.
  {
    id: "sunscreen_usage",
    title: "Do you use sunscreen?",
    type: "single",
    required: true,
    options: [
      { id: "daily", label: "Daily", icon: "🛡️", bg: "var(--mint)" },
      { id: "sometimes", label: "Sometimes", icon: "🌤️", bg: "var(--lavender)" },
      { id: "rarely_never", label: "Rarely or never", icon: "🌧️", bg: "var(--rose)" },
    ],
  },
];

/** Convenience constant for the page renderer. */
export const SKIN_QUIZ_TOTAL_STEPS = skinQuizQuestions.length;
