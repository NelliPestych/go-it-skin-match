import type {
  AnalysisResponse,
  BeautyPlan,
  Product,
  QuizPayload,
  RecommendationResponse,
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

  submitQuiz: async (payload: QuizPayload) =>
    handle<{ id: number; analysis_id: number }>(
      await fetch(`${BASE_URL}/quiz/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),

  recommendations: async (analysisId: number): Promise<RecommendationResponse> =>
    handle<RecommendationResponse>(
      await fetch(`${BASE_URL}/recommendations/${analysisId}`),
    ),

  plan: async (analysisId: number): Promise<BeautyPlan> =>
    handle<BeautyPlan>(await fetch(`${BASE_URL}/plan/${analysisId}`)),

  products: async (): Promise<Product[]> =>
    handle<Product[]>(await fetch(`${BASE_URL}/products`)),
};
