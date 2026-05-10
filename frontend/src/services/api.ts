import type {
  AnalysisDetails,
  AnalysisHistoryItem,
  AnalysisResponse,
  BeautyPlan,
  Product,
  QuizPayload,
  RecommendationResponse,
  SkinFeatures,
} from "../types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) message = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const api = {
  health: async () =>
    handle<{ status: string; database: string; redis: string }>(
      await fetch(`${BASE_URL}/health`),
    ),

  uploadAnalysis: async (file: File): Promise<AnalysisResponse> => {
    const form = new FormData();
    form.append("file", file);
    return handle<AnalysisResponse>(
      await fetch(`${BASE_URL}/analysis/upload`, {
        method: "POST",
        body: form,
      }),
    );
  },

  /**
   * Smart Camera 3-shot upload: posts `front` (required) plus
   * optional `left` / `right` side photos. The backend validates
   * each frame, persists all three, runs heuristic analysis on
   * `front`, and stores the side paths for future multi-angle work.
   *
   * Kept distinct from `uploadAnalysis` so the legacy single-image
   * payload (`file`) remains the obvious default for the manual
   * uploader and any older clients.
   */
  uploadAnalysisMulti: async (input: {
    front: File;
    left?: File | null;
    right?: File | null;
  }): Promise<AnalysisResponse> => {
    const form = new FormData();
    form.append("front", input.front);
    if (input.left) form.append("left", input.left);
    if (input.right) form.append("right", input.right);
    return handle<AnalysisResponse>(
      await fetch(`${BASE_URL}/analysis/upload`, {
        method: "POST",
        body: form,
      }),
    );
  },

  submitQuiz: async (payload: QuizPayload) =>
    handle<{ id: number; analysis_id: number }>(
      await fetch(`${BASE_URL}/quiz/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),

  features: async (analysisId: number): Promise<SkinFeatures> =>
    handle<SkinFeatures>(await fetch(`${BASE_URL}/analysis/${analysisId}`)),

  history: async (): Promise<AnalysisHistoryItem[]> =>
    handle<AnalysisHistoryItem[]>(await fetch(`${BASE_URL}/analysis/history`)),

  details: async (analysisId: number): Promise<AnalysisDetails> =>
    handle<AnalysisDetails>(await fetch(`${BASE_URL}/analysis/${analysisId}/details`)),

  recommendations: async (analysisId: number): Promise<RecommendationResponse> =>
    handle<RecommendationResponse>(
      await fetch(`${BASE_URL}/recommendations/${analysisId}`),
    ),

  plan: async (analysisId: number): Promise<BeautyPlan> =>
    handle<BeautyPlan>(await fetch(`${BASE_URL}/plan/${analysisId}`)),

  products: async (): Promise<Product[]> =>
    handle<Product[]>(await fetch(`${BASE_URL}/products`)),
};
