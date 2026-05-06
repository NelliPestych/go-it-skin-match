import { useState } from "react";
import { useNavigate } from "react-router-dom";

import AnalysisResult from "../components/AnalysisResult";
import ImageUpload from "../components/ImageUpload";
import Quiz from "../components/Quiz";
import { api } from "../services/api";
import type { AnalysisResponse, QuizPayload } from "../types";

export default function AnalysisPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const res = await api.uploadAnalysis(file);
      setAnalysis(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleQuizSubmit = async (payload: QuizPayload) => {
    setError(null);
    setLoading(true);
    try {
      await api.submitQuiz(payload);
      navigate(`/results/${payload.analysis_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quiz submission failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h2>Skin analysis</h2>
      {error && <div className="error">{error}</div>}

      {!analysis && (
        <div className="card">
          <ImageUpload onSelect={setFile} disabled={loading} />
          <div style={{ marginTop: 16 }}>
            <button onClick={handleUpload} disabled={!file || loading}>
              {loading ? "Analyzing…" : "Analyze photo"}
            </button>
          </div>
        </div>
      )}

      {analysis && (
        <>
          <AnalysisResult features={analysis.features} />
          <Quiz
            analysisId={analysis.analysis_id}
            onSubmit={handleQuizSubmit}
            submitting={loading}
          />
        </>
      )}
    </section>
  );
}
