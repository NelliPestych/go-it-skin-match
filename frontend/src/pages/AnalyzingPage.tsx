import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import IconButton from "../components/IconButton";
import PillButton from "../components/PillButton";
import { api } from "../services/api";
import {
  mapConcernsToLegacy,
  mapSensitivityToLegacyBool,
  mapSkinTypeToLegacy,
} from "../services/quizMapping";
import { useFlow } from "../state/flow";
import type { QuizPayload } from "../types";

const STEPS = [
  "Profile data synchronized",
  "Environmental factors loaded",
  "Identifying active ingredients",
  "Finalizing routine map",
];

export default function AnalyzingPage() {
  const navigate = useNavigate();
  // `quizAnswers` is the new canonical source (filled by `QuizPage`).
  // Legacy `skinType` / `concerns` views are still available on the
  // context but no longer read here — every signal AnalyzingPage
  // needs comes straight from `quizAnswers`, projected through the
  // pure mappers right before the network call below.
  const { imageFile, additionalImages, quizAnswers } = useFlow();
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Guard: missing prerequisites means the user navigated here
    // directly. Send them back to the right step.
    if (!imageFile) {
      navigate("/capture", { replace: true });
      return;
    }
    // The user must have either picked an explicit skin type OR
    // explicitly selected "not sure" — both populate `quizAnswers.skin_type`.
    // We don't require `skinType` (legacy, non-null) here because the
    // backend treats a missing self-reported skin type as "AI decides".
    if (!quizAnswers.skin_type) {
      navigate("/quiz/1", { replace: true });
      return;
    }

    let cancelled = false;
    const stepTimers: number[] = [];

    STEPS.forEach((_, idx) => {
      stepTimers.push(
        window.setTimeout(() => {
          if (!cancelled) setCurrentStep(idx + 1);
        }, (idx + 1) * 800),
      );
    });

    (async () => {
      try {
        // Dispatch on whether the user has any side photos: Smart
        // Camera → multi-image POST so all 3 frames are persisted;
        // manual uploader → legacy single-image POST.  The backend
        // accepts both and runs heuristic analysis on `front` only
        // either way, so the rest of this flow is identical.
        const hasExtras = !!(additionalImages.left || additionalImages.right);
        const upload = hasExtras
          ? await api.uploadAnalysisMulti({
              front: imageFile,
              left: additionalImages.left,
              right: additionalImages.right,
            })
          : await api.uploadAnalysis(imageFile);

        // Assemble the wire payload.
        // - Legacy fields (`self_reported_skin_type`, `concerns`,
        //   `sensitivity`) are derived from the new `quizAnswers`
        //   via the pure mappers in `services/quizMapping.ts` so
        //   the existing backend RecommendationEngine keeps working
        //   unchanged.
        // - The new optional fields (Q4..Q7 + raw_*) are sent
        //   verbatim. Backend will adopt them in Step 4; until then
        //   Pydantic silently drops them — see QuizPayload comment.
        const payload: QuizPayload = {
          analysis_id: upload.analysis_id,
          self_reported_skin_type: mapSkinTypeToLegacy(quizAnswers.skin_type),
          concerns: mapConcernsToLegacy(quizAnswers.concerns),
          sensitivity: mapSensitivityToLegacyBool(quizAnswers.sensitivity),
          routine_level: quizAnswers.routine_level,
          breakout_frequency: quizAnswers.breakout_frequency,
          daily_environment: quizAnswers.daily_environment,
          sunscreen_usage: quizAnswers.sunscreen_usage,
          raw_concerns: quizAnswers.concerns,
          raw_sensitivity: quizAnswers.sensitivity,
        };
        await api.submitQuiz(payload);
        // ensure the loader plays at least 2.5s for UX
        await new Promise((r) => setTimeout(r, 2400));
        if (!cancelled) navigate(`/results/${upload.analysis_id}`, { replace: true });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Analysis failed");
      }
    })();

    return () => {
      cancelled = true;
      stepTimers.forEach((t) => window.clearTimeout(t));
    };
  }, [imageFile, additionalImages, quizAnswers, navigate]);

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

      <div
        className="relative"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "16px 32px",
        }}
      >
        {error ? (
          <>
            <h1 className="h1" style={{ textAlign: "center", marginBottom: 12 }}>
              Analysis failed
            </h1>
            <div className="error" style={{ width: "100%", margin: "0 0 16px" }}>
              {error}
            </div>
            <PillButton onClick={() => navigate("/capture")}>Try again</PillButton>
            <div style={{ height: 12 }} />
            <PillButton variant="secondary" onClick={() => navigate("/")}>
              Back home
            </PillButton>
          </>
        ) : (
          <>
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
                    <span style={{ opacity: state === "todo" ? 0.5 : 1 }}>
                      {step}
                      {state === "pending" ? "..." : ""}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="analyzing-orbit" style={{ marginTop: 32 }}>
              <span style={{ fontSize: 56 }}>👤</span>
              <div className="analyzing-scan-line" />
            </div>
          </>
        )}
      </div>

      <div className="screen-footer relative" style={{ paddingBottom: 24, background: "transparent" }}>
        <div className="helper" style={{ display: "flex", justifyContent: "center", gap: 6 }}>
          <span style={{ color: "var(--gold)" }}>✦</span>
          <span>Advanced Bio-Metric Synthesis</span>
        </div>
      </div>
    </div>
  );
}
