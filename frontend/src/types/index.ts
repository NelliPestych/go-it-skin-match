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
  image_path: string;
}

export interface QuizPayload {
  analysis_id: number;
  self_reported_skin_type?: SkinType;
  concerns: Concern[];
  sensitivity: boolean;
  age_range?: string;
  sun_exposure?: string;
  current_routine_complexity?: string;
  budget?: "low" | "medium" | "high";
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

export interface AnalysisDetails {
  analysis_id: number;
  created_at: string;
  features: SkinFeatures;
  quiz_answers?: Record<string, unknown> | null;
  recommendations: RecommendationItem[];
  plan?: BeautyPlan | null;
}
