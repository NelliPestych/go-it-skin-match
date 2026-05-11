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
    title: "How would you describe your skin type?",
    subtitle: "We compare your answer with our AI reading to fine-tune your routine.",
    type: "single",
    required: true,
    options: [
      {
        id: "dry",
        label: "Dry",
        description: "Tight, flaky, or dull appearance",
        icon: "💧",
        bg: "var(--cream)",
      },
      {
        id: "oily",
        label: "Oily",
        description: "Shiny, enlarged pores, acne-prone",
        icon: "✨",
        bg: "var(--mint)",
      },
      {
        id: "combination",
        label: "Combination",
        description: "Oily T-zone, dry or normal cheeks",
        icon: "🌗",
        bg: "var(--rose)",
      },
      {
        id: "normal",
        label: "Normal",
        description: "Balanced, smooth, few imperfections",
        icon: "🪷",
        bg: "var(--lavender)",
      },
      {
        id: "not_sure",
        label: "Not sure",
        description: "Let the AI analysis decide for you",
        icon: "❓",
        bg: "var(--sky)",
      },
    ],
  },

  // ── Q2 ─────────────────────────────────────────────────────────
  // Main skin concerns. Multi-select — drives product scoring.
  // Mapped to legacy backend `Concern` values at submit time in
  // `services/quizMapping.ts`.
  {
    id: "concerns",
    title: "What are your main skin concerns?",
    subtitle: "Pick everything that bothers you — we'll prioritise products that address them.",
    type: "multi",
    required: true,
    options: [
      {
        id: "acne_breakouts",
        label: "Acne / breakouts",
        icon: "🌋",
        bg: "var(--rose)",
      },
      {
        id: "redness",
        label: "Redness",
        icon: "🌹",
        bg: "var(--rose)",
      },
      {
        id: "dryness",
        label: "Dryness",
        icon: "💧",
        bg: "var(--cream)",
      },
      {
        id: "oiliness",
        label: "Oiliness",
        icon: "🧴",
        bg: "var(--mint)",
      },
      {
        id: "pigmentation_dark_spots",
        label: "Pigmentation / dark spots",
        icon: "🎨",
        bg: "var(--lavender)",
      },
      {
        id: "fine_lines",
        label: "Fine lines",
        icon: "🪞",
        bg: "var(--sky)",
      },
      {
        id: "large_pores",
        label: "Large pores",
        icon: "🔍",
        bg: "white",
      },
    ],
  },

  // ── Q3 ─────────────────────────────────────────────────────────
  // Skin sensitivity. Single-select — gates harsh ingredients and
  // boosts gentle / fragrance-free products.
  {
    id: "sensitivity",
    title: "How sensitive is your skin?",
    subtitle: "We avoid stronger active ingredients when sensitivity is high.",
    type: "single",
    required: true,
    options: [
      {
        id: "very_sensitive",
        label: "Very sensitive",
        description: "Reacts often to products, weather, or stress",
        icon: "🌸",
        bg: "var(--rose)",
      },
      {
        id: "sometimes_reacts",
        label: "Sometimes reacts",
        description: "Occasional flare-ups to specific ingredients",
        icon: "🌼",
        bg: "var(--cream)",
      },
      {
        id: "not_sensitive",
        label: "Not sensitive",
        description: "I tolerate most products well",
        icon: "🌿",
        bg: "var(--mint)",
      },
    ],
  },

  // ── Q4 ─────────────────────────────────────────────────────────
  // Current routine level. Drives plan complexity.
  {
    id: "routine_level",
    title: "Do you currently use skincare products?",
    subtitle: "We adjust how many steps your daily routine contains.",
    type: "single",
    required: true,
    options: [
      {
        id: "regularly",
        label: "Regularly",
        description: "I have a daily routine I follow",
        icon: "📅",
        bg: "var(--mint)",
      },
      {
        id: "sometimes",
        label: "Sometimes",
        description: "I use products on and off",
        icon: "🗓️",
        bg: "var(--lavender)",
      },
      {
        id: "no",
        label: "No",
        description: "I'm starting from scratch",
        icon: "🌱",
        bg: "var(--cream)",
      },
    ],
  },

  // ── Q5 ─────────────────────────────────────────────────────────
  // Breakout frequency. Boosts acne-safe / non-comedogenic products.
  {
    id: "breakout_frequency",
    title: "How often do you get breakouts?",
    subtitle: "Frequent breakouts shift the routine toward acne-safe formulations.",
    type: "single",
    required: true,
    options: [
      {
        id: "often",
        label: "Often",
        description: "Multiple times a month",
        icon: "🌋",
        bg: "var(--rose)",
      },
      {
        id: "sometimes",
        label: "Sometimes",
        description: "Around my cycle or under stress",
        icon: "🌗",
        bg: "var(--lavender)",
      },
      {
        id: "rarely",
        label: "Rarely",
        description: "A few times a year at most",
        icon: "🌤️",
        bg: "var(--sky)",
      },
      {
        id: "never",
        label: "Never",
        description: "I don't get breakouts",
        icon: "🌿",
        bg: "var(--mint)",
      },
    ],
  },

  // ── Q6 ─────────────────────────────────────────────────────────
  // Daily environment. Adjusts antioxidant / SPF emphasis.
  {
    id: "daily_environment",
    title: "How would you describe your daily environment?",
    subtitle: "Pollution, sun, and indoor air affect which protective layers we recommend.",
    type: "single",
    required: true,
    options: [
      {
        id: "urban_pollution",
        label: "Urban / polluted",
        description: "City life, traffic, dust",
        icon: "🏙️",
        bg: "var(--lavender)",
      },
      {
        id: "mostly_indoors",
        label: "Mostly indoors",
        description: "Office, home, controlled climate",
        icon: "🏠",
        bg: "var(--cream)",
      },
      {
        id: "sunny_outdoor",
        label: "Sunny / outdoor",
        description: "I spend lots of time in direct sun",
        icon: "☀️",
        bg: "var(--mint)",
      },
    ],
  },

  // ── Q7 ─────────────────────────────────────────────────────────
  // Sunscreen usage. Triggers SPF education + ensures SPF in routine.
  {
    id: "sunscreen_usage",
    title: "Do you use sunscreen regularly?",
    subtitle: "Daily SPF is the single most impactful step in any routine.",
    type: "single",
    required: true,
    options: [
      {
        id: "daily",
        label: "Daily",
        description: "Year-round, every morning",
        icon: "🛡️",
        bg: "var(--mint)",
      },
      {
        id: "sometimes",
        label: "Sometimes",
        description: "When I remember or on sunny days",
        icon: "🌤️",
        bg: "var(--lavender)",
      },
      {
        id: "rarely_never",
        label: "Rarely or never",
        description: "Not yet part of my routine",
        icon: "🌧️",
        bg: "var(--rose)",
      },
    ],
  },
];

/** Convenience constant for the page renderer. */
export const SKIN_QUIZ_TOTAL_STEPS = skinQuizQuestions.length;
