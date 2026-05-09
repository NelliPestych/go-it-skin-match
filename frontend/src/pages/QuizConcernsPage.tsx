import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import PillButton from "../components/PillButton";
import QuizHeader from "../components/QuizHeader";
import { useFlow } from "../state/flow";
import type { Concern } from "../types";

// The labels here match the backend's Concern enum 1:1 so the user's
// selection is forwarded verbatim to /quiz/submit and the recommendation
// engine can apply the matching scoring rules.
const OPTIONS: { value: Concern; title: string; bg: string; icon: string }[] = [
  { value: "oiliness", title: "Oiliness", bg: "var(--mint)", icon: "🧴" },
  { value: "redness", title: "Redness", bg: "var(--rose)", icon: "🌹" },
  { value: "pigmentation", title: "Pigmentation", bg: "var(--cream)", icon: "🎨" },
  { value: "hydration", title: "Hydration", bg: "var(--lavender)", icon: "💧" },
  { value: "sensitivity", title: "Sensitivity", bg: "var(--sky)", icon: "💎" },
  { value: "pores", title: "Pores", bg: "white", icon: "🔍" },
];

export default function QuizConcernsPage() {
  const navigate = useNavigate();
  const { concerns, toggleConcern, imageFile, skinType } = useFlow();

  // Guard: if the user opens this URL without finishing the prior steps.
  useEffect(() => {
    if (!imageFile) navigate("/capture", { replace: true });
    else if (!skinType) navigate("/quiz/skin-type", { replace: true });
  }, [imageFile, skinType, navigate]);

  return (
    <div className="screen relative">
      <div className="blob rose-bottom-left" />
      <div className="blob lavender-top-right" />
      <div className="blob sky-mid-left" />
      <div className="blob cream-mid-right" />

      <div className="relative">
        <QuizHeader step={2} totalSteps={3} hint="Select all that apply" />
      </div>

      <div className="screen-pad relative" style={{ marginTop: 32 }}>
        <h1 className="h1" style={{ marginBottom: 12 }}>
          What are your main
          <br />
          skin concerns?
        </h1>
        <p className="body" style={{ marginBottom: 12 }}>
          Choose the areas you want to focus on. We'll tailor your routine to address these specifically.
        </p>
      </div>

      <div className="concerns-grid relative">
        {OPTIONS.map((opt) => {
          const selected = concerns.includes(opt.value);
          return (
            <button
              key={opt.value}
              className={"option-square" + (selected ? " selected" : "")}
              style={{ background: opt.bg }}
              onClick={() => toggleConcern(opt.value)}
            >
              <div className="icon-tile">
                <span>{opt.icon}</span>
              </div>
              <h4>{opt.title}</h4>
              <div className="check">{selected && "✓"}</div>
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 16 }} />

      <div className="screen-footer relative" style={{ background: "var(--bg-cream)" }}>
        <PillButton
          onClick={() => navigate("/analyzing")}
          disabled={concerns.length === 0}
          trailingIcon={<span>→</span>}
        >
          Continue
        </PillButton>
        <div className="helper" style={{ display: "flex", justifyContent: "center", gap: 6 }}>
          <span>🔒</span>
          <span>Your data is secure & clinical grade</span>
        </div>
      </div>
    </div>
  );
}
