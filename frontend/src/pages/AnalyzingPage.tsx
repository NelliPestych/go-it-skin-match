import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import IconButton from "../components/IconButton";
import { api } from "../services/api";
import { useFlow } from "../state/flow";

const STEPS = [
  "Profile data synchronized",
  "Environmental factors loaded",
  "Identifying active ingredients",
  "Finalizing routine map",
];

export default function AnalyzingPage() {
  const navigate = useNavigate();
  const { imageFile, skinType, concerns } = useFlow();
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!imageFile || !skinType) {
      navigate("/capture");
      return;
    }

    let cancelled = false;
    const stepTimers: number[] = [];

    // animate the checklist
    STEPS.forEach((_, idx) => {
      stepTimers.push(window.setTimeout(() => !cancelled && setCurrentStep(idx + 1), (idx + 1) * 800));
    });

    (async () => {
      try {
        const upload = await api.uploadAnalysis(imageFile);
        await api.submitQuiz({
          analysis_id: upload.analysis_id,
          self_reported_skin_type: skinType,
          concerns,
          sensitivity: concerns.includes("sensitivity"),
        });
        // ensure the loader plays at least 2.5s for UX
        await new Promise((r) => setTimeout(r, 2400));
        if (!cancelled) navigate(`/results/${upload.analysis_id}`);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Analysis failed");
      }
    })();

    return () => {
      cancelled = true;
      stepTimers.forEach((t) => window.clearTimeout(t));
    };
  }, [imageFile, skinType, concerns, navigate]);

  return (
    <div className="screen relative analyzing-screen">
      <div className="blob rose-bottom-left" />
      <div className="blob lavender-top-right" />
      <div className="blob cream-mid-right" />

      <div className="app-header relative">
        <div style={{ width: 40 }} />
        <div className="app-header-center">
          <span className="eyebrow">SkinMatch AI</span>
          <div className="divider" />
        </div>
        <IconButton onClick={() => navigate("/")} aria-label="Close">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </IconButton>
      </div>

      <div className="relative" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 32px" }}>
        <h1 className="h1" style={{ textAlign: "center", marginBottom: 12 }}>
          Analyzing your skin...
        </h1>
        <p className="body" style={{ textAlign: "center", maxWidth: 260, marginBottom: 16 }}>
          Our AI is processing your profile to build your personalized dermatological routine.
        </p>

        <div className="checklist" style={{ width: "100%", maxWidth: 280 }}>
          {STEPS.map((step, idx) => {
            let state: "done" | "pending" | "todo" = "todo";
            if (idx < currentStep - 1) state = "done";
            else if (idx === currentStep - 1) state = "pending";
            return (
              <div className="item" key={step}>
                <div className={"check " + state}>{state === "done" ? "✓" : ""}</div>
                <span style={{ opacity: state === "todo" ? 0.5 : 1 }}>{step}{state === "pending" ? "..." : ""}</span>
              </div>
            );
          })}
        </div>

        <div className="analyzing-orbit" style={{ marginTop: 32 }}>
          <span style={{ fontSize: 56 }}>👤</span>
          <div className="analyzing-scan-line" />
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="screen-footer relative" style={{ paddingBottom: 24, background: "transparent" }}>
        <div className="helper" style={{ display: "flex", justifyContent: "center", gap: 6 }}>
          <span style={{ color: "var(--gold)" }}>✦</span>
          <span>Advanced Bio-Metric Synthesis</span>
        </div>
      </div>
    </div>
  );
}
