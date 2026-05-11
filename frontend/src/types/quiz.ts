/**
 * Quiz domain types.
 *
 * Why a separate file from `types/index.ts`:
 * The legacy types in `types/index.ts` (SkinType, Concern, QuizPayload)
 * mirror the existing backend Pydantic enums and the wire payload of
 * `POST /quiz/submit`. We deliberately do NOT touch those — they stay
 * the contract with the backend so old callers (tests, the manual
 * uploader flow) keep working unchanged.
 *
 * The types below describe the *new, richer UI domain* — the 7-question
 * skincare quiz the user actually clicks through. The mapping from
 * these UI values to the legacy wire types happens in
 * `services/quizMapping.ts` immediately before the network call,
 * preserving the API boundary.
 *
 * Naming:
 * - `SkinTypeAnswer` (not `SkinType`) — UI lets the user say "not sure",
 *   which the AI analyser settles. The legacy `SkinType` from
 *   `types/index.ts` has no such value.
 * - `SkinConcern` (not `Concern`) — UI uses richer, user-facing labels
 *   (`acne_breakouts`, `fine_lines`, `pigmentation_dark_spots`) that
 *   don't all exist 1:1 in the backend's `Concern` enum.
 */

// ── Per-answer value unions ────────────────────────────────────────
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

// ── Aggregate answer bag ───────────────────────────────────────────
/**
 * Full set of quiz answers, all optional during data entry.
 * `Required` validation lives on the question config (`required: true`)
 * rather than on the type — that way a partially-filled flow can be
 * resumed without TS yelling, and the UI is the single source of
 * truth for "may this user move on yet?".
 */
export interface QuizAnswers {
  skin_type?: SkinTypeAnswer;
  concerns?: SkinConcern[];
  sensitivity?: SkinSensitivity;
  routine_level?: RoutineLevel;
  breakout_frequency?: BreakoutFrequency;
  daily_environment?: DailyEnvironment;
  sunscreen_usage?: SunscreenUsage;
}

/** Type-safe key into the answer bag — used by question configs to
 *  pick which slot they write to. */
export type QuizAnswerKey = keyof QuizAnswers;

// ── Config primitives ──────────────────────────────────────────────
export type QuizQuestionType = "single" | "multi";

export interface QuizOption {
  /** Stable identifier — matches one of the per-question value unions
   *  above (e.g. "dry", "acne_breakouts"). Validation that `id` is a
   *  legal value for the parent question's answer type lives in the
   *  config-validity tests. */
  id: string;
  label: string;
  /** Optional one-line supporting copy under the label. */
  description?: string;
  /** Emoji or single character — the UI renders it in a small tile. */
  icon?: string;
  /** Optional CSS custom-property name from the design palette
   *  (e.g. "var(--rose)") for visual variety across cards. */
  bg?: string;
}

export interface QuizQuestion {
  /** Answer-bag slot this question writes to. */
  id: QuizAnswerKey;
  title: string;
  /** Optional short helper rendered under the title. */
  subtitle?: string;
  type: QuizQuestionType;
  required: boolean;
  /** For multi-select questions: hard cap on how many options can be
   *  selected. Omitted ⇒ unlimited. */
  maxSelections?: number;
  options: QuizOption[];
}
