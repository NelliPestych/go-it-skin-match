/**
 * Quiz UI domain types — richer than the legacy wire types in `types/index.ts`.
 * Mapping to the wire payload happens in `services/quizMapping.ts`.
 */

export type SkinTypeAnswer =
  | "dry"
  | "oily"
  | "combination"
  | "normal"
  | "not_sure";

export type SkinConcern =
  | "acne_breakouts"
  | "redness"
  | "dryness"
  | "oiliness"
  | "pigmentation_dark_spots"
  | "fine_lines"
  | "large_pores";

export type SkinSensitivity =
  | "very_sensitive"
  | "sometimes_reacts"
  | "not_sensitive";

export type RoutineLevel = "regularly" | "sometimes" | "no";

export type BreakoutFrequency = "often" | "sometimes" | "rarely" | "never";

export type DailyEnvironment =
  | "urban_pollution"
  | "mostly_indoors"
  | "sunny_outdoor";

export type SunscreenUsage = "daily" | "sometimes" | "rarely_never";

/** All optional during entry — required-ness lives on the question config. */
export interface QuizAnswers {
  skin_type?: SkinTypeAnswer;
  concerns?: SkinConcern[];
  sensitivity?: SkinSensitivity;
  routine_level?: RoutineLevel;
  breakout_frequency?: BreakoutFrequency;
  daily_environment?: DailyEnvironment;
  sunscreen_usage?: SunscreenUsage;
}

export type QuizAnswerKey = keyof QuizAnswers;

export type QuizQuestionType = "single" | "multi";

export interface QuizOption {
  /** Stable id — matches one of the per-question value unions above. */
  id: string;
  label: string;
  description?: string;
  /** Emoji or single character rendered as a small tile. */
  icon?: string;
  /** Optional CSS custom-property name (e.g. "var(--rose)"). */
  bg?: string;
}

export interface QuizQuestion {
  id: QuizAnswerKey;
  title: string;
  subtitle?: string;
  type: QuizQuestionType;
  required: boolean;
  /** Hard cap for multi-select; omitted → unlimited. */
  maxSelections?: number;
  options: QuizOption[];
}
