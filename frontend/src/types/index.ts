export type SkinType = "dry" | "oily" | "combination" | "normal";
export type Level = "low" | "medium" | "high";
export type Concern =
  | "redness"
  | "pigmentation"
  | "hydration"
  | "pores"
  | "oiliness"
  | "sensitivity";

export interface SkinFeatures {
  skin_type: SkinType;
  redness_level: Level;
  hydration_level: Level;
  pigmentation_level: Level;
  pores_score: number;
  confidence_score: number;
}

export interface AnalysisResponse {
  analysis_id: number;
  features: SkinFeatures;
  /** Mirror of the legacy single-image column; for Smart Camera
   *  uploads it equals `image_front_path`. */
  image_path: string;
  /** Per-pose paths from the Smart Camera 3-shot upload.  Null on
   *  legacy single-image uploads.  MVP uses `image_front_path`
   *  for analysis; left / right are stored for future use. */
  image_front_path?: string | null;
  image_left_path?: string | null;
  image_right_path?: string | null;
}

export interface QuizPayload {
  analysis_id: number;
  // ── Legacy fields (unchanged shape; backend still primary-uses these) ──
  self_reported_skin_type?: SkinType;
  concerns: Concern[];
  sensitivity: boolean;
  age_range?: string;
  sun_exposure?: string;
  current_routine_complexity?: string;
  budget?: "low" | "medium" | "high";
  // ── Step-3 extensions: new optional quiz fields ───────────────────────
  // All optional, so older callers (manual upload + tests) still produce
  // a valid payload without setting any of these.
  //
  // Until Step 4 adds matching Optional fields to the backend Pydantic
  // schema, these keys are silently dropped by Pydantic v2 (default
  // `extra='ignore'`).  That's intentional: shipping the wire change
  // now lets us land Step 4 without a coordinated FE/BE deploy, and
  // there is no regression in the meantime — the legacy fields above
  // (skin_type, concerns, sensitivity) still carry the signals the
  // recommendation engine already consumes.
  routine_level?: "regularly" | "sometimes" | "no";
  breakout_frequency?: "often" | "sometimes" | "rarely" | "never";
  daily_environment?: "urban_pollution" | "mostly_indoors" | "sunny_outdoor";
  sunscreen_usage?: "daily" | "sometimes" | "rarely_never";
  /** Raw UI concerns preserved for analytics / future scoring rules.
   *  Independent of the legacy `concerns` field, which is the mapped
   *  projection the recommendation engine already consumes. */
  raw_concerns?: string[];
  /** Raw UI sensitivity level ("very_sensitive" | "sometimes_reacts" |
   *  "not_sensitive") — preserves the 3-way signal alongside the
   *  collapsed legacy boolean. */
  raw_sensitivity?: "very_sensitive" | "sometimes_reacts" | "not_sensitive";
}

export interface Product {
  id: number;
  brand: string;
  name: string;
  category: string;
  skin_types: string[];
  concerns: string[];
  ingredients: string[];
  price: number;
  affiliate_url?: string | null;
  description?: string | null;
}

export interface RecommendationItem {
  product: Product;
  score: number;
  reasons: string[];
}

export interface RecommendationResponse {
  analysis_id: number;
  items: RecommendationItem[];
  cached: boolean;
}

export interface RoutineStep {
  order: number;
  category: string;
  product_name: string;
  instruction: string;
}

export interface BeautyPlan {
  analysis_id: number;
  summary: string;
  daily: { morning: RoutineStep[]; evening: RoutineStep[] };
  weekly_tips: { day: string; tip: string }[];
  lifestyle_tips: string[];
}

export interface AnalysisHistoryItem {
  analysis_id: number;
  created_at: string;
  skin_type: SkinType | string;
  confidence_score: number;
  top_products: string[];
}

/** Extended AI signals returned alongside the legacy `features` block
 *  on `/analysis/{id}/details`.  Mirrors the backend `AIMetrics` schema.
 *
 *  Every field beyond `provider` + `confidence_score` is optional so a
 *  scan persisted before the provider abstraction landed still
 *  round-trips through the endpoint without errors.  The sentinel
 *  `provider === "legacy"` lets the UI render the basic, pre-provider
 *  layout without leaking internal provider names. */
export interface AIMetricsView {
  provider: string;
  confidence_score: number;
  oiliness?: Level | null;
  acne?: Level | null;
  fine_lines?: Level | null;
  texture?: Level | null;
  recommendation_signals?: Record<string, number> | null;
  analyzed_at?: string | null;
}

export interface AnalysisDetails {
  analysis_id: number;
  created_at: string;
  features: SkinFeatures;
  ai_metrics?: AIMetricsView | null;
  quiz_answers?: Record<string, unknown> | null;
  recommendations: RecommendationItem[];
  plan?: BeautyPlan | null;
}
