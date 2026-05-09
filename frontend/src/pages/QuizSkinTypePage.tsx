import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import PillButton from "../components/PillButton";
import QuizHeader from "../components/QuizHeader";
import { useFlow } from "../state/flow";
import type { SkinType } from "../types";

const OPTIONS: {
  value: SkinType;
  title: string;
  desc: string;
  bg: string;
  icon: string;
  iconBg: string;
}[] = [
  { value: "dry", title: "Dry", desc: "Tight, flaky, or dull appearance", bg: "var(--cream)", icon: "💧", iconBg: "rgba(255,255,255,0.5)" },
  { value: "oily", title: "Oily", desc: "Shiny, enlarged pores, acne-prone", bg: "var(--mint)", icon: "✨", iconBg: "rgba(255,255,255,0.5)" },
  { value: "combination", title: "Combination", desc: "Oily T-zone, dry or normal cheeks", bg: "var(--rose)", icon: "🌗", iconBg: "rgba(255,255,255,0.5)" },
  { value: "normal", title: "Normal", desc: "Balanced, smooth, few imperfections", bg: "var(--lavender)", icon: "❓", iconBg: "rgba(255,255,255,0.5)" },
];

export default function QuizSkinTypePage() {
  const navigate = useNavigate();
  const { skinType, setSkinType, imageFile } = useFlow();

  // Guard: if the user opens this URL without uploading first, send
  // them back to capture.
  useEffect(() => {
    if (!imageFile) navigate("/capture", { replace: true });
  }, [imageFile, navigate]);

  const onContinue = () => {
    if (!skinType) return;
    navigate("/quiz/concerns");
  };

  return (
    <div className="screen relative">
      <div className="blob rose-bottom-left" />
      <div className="blob lavender-top-right" />
      <div className="relative">
        <QuizHeader step={1} totalSteps={3} hint="Personalizing Results..." />
      </div>

      <div className="screen-pad relative" style={{ marginTop: 32 }}>
        <h1 className="h1" style={{ marginBottom: 16 }}>
          What is your skin
          <br />
          type?
        </h1>
        <p className="body" style={{ marginBottom: 24 }}>
          This helps our AI recommend the perfect texture and ingredients for your daily ritual.
        </p>

        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={"option-card" + (skinType === opt.value ? " selected" : "")}
            style={{ background: opt.bg }}
            onClick={() => setSkinType(opt.value)}
          >
            <div className="icon-tile" style={{ background: opt.iconBg }}>
              <span style={{ fontSize: 22 }}>{opt.icon}</span>
            </div>
            <div className="body-text">
              <h4>{opt.title}</h4>
              <p>{opt.desc}</p>
            </div>
            <div className="radio">{skinType === opt.value && "✓"}</div>
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />
      <div className="screen-footer relative">
        <PillButton onClick={onContinue} disabled={!skinType}>
          Continue
        </PillButton>
      </div>
    </div>
  );
}
