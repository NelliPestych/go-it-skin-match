/** Quiz config — single source of truth for the 7 questions; QuizPage indexes by step. */
import type { QuizQuestion } from "../types/quiz";

export const skinQuizQuestions: QuizQuestion[] = [
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

  {
    id: "concerns",
    title: "Your main concerns?",
    type: "multi",
    required: true,
    options: [
      { id: "acne_breakouts", label: "Acne / breakouts", icon: "🌋", bg: "var(--rose)" },
      { id: "redness", label: "Redness", icon: "🌹", bg: "var(--lavender)" },
      { id: "dryness", label: "Dryness", icon: "💧", bg: "var(--cream)" },
      { id: "oiliness", label: "Oiliness", icon: "🧴", bg: "var(--mint)" },
      { id: "pigmentation_dark_spots", label: "Pigmentation", icon: "🎨", bg: "var(--lavender)" },
      { id: "fine_lines", label: "Fine lines", icon: "🪞", bg: "var(--sky)" },
      { id: "large_pores", label: "Large pores", icon: "🔍", bg: "white" },
    ],
  },

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

export const SKIN_QUIZ_TOTAL_STEPS = skinQuizQuestions.length;
