import { useNavigate } from "react-router-dom";

import IconButton from "../components/IconButton";
import PillButton from "../components/PillButton";

export default function HomePage() {
  const navigate = useNavigate();
  return (
    <div className="screen">
      <div className="app-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 9999,
              background: "var(--rose)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
            }}
          >
            ✦
          </span>
          <span className="font-serif" style={{ fontWeight: 700, fontSize: 20, letterSpacing: -0.5 }}>
            SkinMatch
          </span>
        </div>
        <IconButton aria-label="Menu">
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
            <path d="M1 1h12M1 5h12M1 9h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </IconButton>
      </div>

      <div className="intro-hero">
        <div className="intro-hero-emoji">✨</div>
      </div>

      <div className="intro-section">
        <span className="badge-pill" style={{ marginBottom: 12 }}>
          AI Skin Intelligence
        </span>
        <h1 className="h-display" style={{ fontSize: 40, lineHeight: "48px", marginBottom: 12 }}>
          Welcome to
          <br />
          SkinMatch
        </h1>
        <p className="body" style={{ maxWidth: 280, margin: "0 auto 8px" }}>
          Take a photo and complete a quick quiz to get personalized skincare recommendations.
        </p>
      </div>

      <div className="screen-pad" style={{ marginTop: 12 }}>
        <div className="intro-feature">
          <div className="tile rose">⚡</div>
          <div>
            <h3>Instant Analysis</h3>
            <p>AI-powered facial scanning for deeper skin insights.</p>
          </div>
        </div>
        <div className="intro-feature">
          <div className="tile mint">🧪</div>
          <div>
            <h3>Science Backed</h3>
            <p>Dermatologist approved routines for every skin type.</p>
          </div>
        </div>
      </div>

      <div className="intro-step-card">
        <div className="step-row">
          <div>
            <div className="step-num">Step 01</div>
            <div className="step-title">The Skin Quiz</div>
          </div>
          <div className="intro-step-arrow">→</div>
        </div>
        <div className="intro-step-segments">
          <div className="seg fill" style={{ flex: 0.4 }} />
          <div className="seg" />
          <div className="seg" />
        </div>
        <div className="caption" style={{ color: "var(--text-60)" }}>
          3 minutes to your perfect routine.
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div className="screen-footer">
        <PillButton onClick={() => navigate("/capture")}>Start Analysis</PillButton>
        <button
          onClick={() => navigate("/history")}
          className="text-link"
          style={{ display: "block", margin: "12px auto 0" }}
        >
          View my results →
        </button>
        <div className="helper">By continuing, you agree to our Terms of Service</div>
      </div>
    </div>
  );
}
