import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import IconButton from "../components/IconButton";
import PillButton from "../components/PillButton";
import { api } from "../services/api";
import type { BeautyPlan, RecommendationItem, SkinFeatures } from "../types";

const PRODUCT_BG = ["var(--bg-results)", "var(--cream)", "var(--rose)", "var(--mint)", "var(--sky)", "var(--lavender)"];
const PRODUCT_EMOJI: Record<string, string> = {
  cleanser: "🧴",
  moisturizer: "🪞",
  serum: "💧",
  sunscreen: "☀️",
  toner: "🌸",
  treatment: "✨",
};

function levelToPercent(level?: string): number {
  if (level === "high") return 85;
  if (level === "medium") return 60;
  if (level === "low") return 30;
  return 50;
}

/** Build chips like "Mild Redness", "Hydrated", from raw features. */
function featureChips(f: SkinFeatures): string[] {
  const chips: string[] = [];
  if (f.redness_level === "high") chips.push("High Redness");
  else if (f.redness_level === "medium") chips.push("Mild Redness");
  if (f.hydration_level === "low") chips.push("Dehydrated");
  else if (f.hydration_level === "high") chips.push("Hydrated");
  if (f.pigmentation_level === "high") chips.push("Pigmentation");
  if (f.pores_score > 0.6) chips.push("Visible Pores");
  if (chips.length === 0) chips.push("Balanced");
  return chips;
}

export default function ResultsPage() {
  const navigate = useNavigate();
  const { analysisId } = useParams();
  const id = Number(analysisId);
  const [recos, setRecos] = useState<RecommendationItem[] | null>(null);
  const [plan, setPlan] = useState<BeautyPlan | null>(null);
  const [features, setFeatures] = useState<SkinFeatures | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        // Single round-trip: details endpoint returns features + recos +
        // plan in one shape, and works for both fresh analyses (where
        // /quiz/submit eagerly persists everything) and historical ones.
        const d = await api.details(id);
        if (cancelled) return;
        setFeatures(d.features);
        setRecos(d.recommendations);
        setPlan(d.plan ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="screen screen-pad" style={{ paddingTop: 48 }}>
        <div className="error">{error}</div>
        <p className="muted" style={{ marginBottom: 16 }}>
          We couldn't load your results. Please try the analysis again.
        </p>
        <PillButton onClick={() => navigate("/capture")}>Try again</PillButton>
        <div style={{ height: 12 }} />
        <PillButton variant="secondary" onClick={() => navigate("/")}>
          Back home
        </PillButton>
      </div>
    );
  }

  if (!features || recos === null) {
    return (
      <div className="screen" style={{ background: "var(--bg-results)" }}>
        <div className="screen-pad" style={{ paddingTop: 24 }}>
          <div className="skeleton" style={{ height: 200, marginBottom: 24 }} />
          <div className="skeleton" style={{ height: 32, marginBottom: 12, width: "60%" }} />
          <div className="skeleton" style={{ height: 240, marginBottom: 24 }} />
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      </div>
    );
  }

  const hydration = levelToPercent(features.hydration_level);
  const chips = featureChips(features);

  return (
    <div className="screen relative" style={{ background: "var(--bg-results)" }}>
      <div className="blob rose-bottom-left" />
      <div className="blob sky-mid-left" style={{ left: "auto", right: -120 }} />

      <div
        className="app-header relative"
        style={{ background: "rgba(250,249,246,0.8)", backdropFilter: "blur(12px)" }}
      >
        <IconButton onClick={() => navigate("/")} aria-label="Back">
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
            <path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </IconButton>
        <div className="app-header-center">
          <span className="eyebrow">Analysis Complete</span>
          <div className="divider" style={{ background: "var(--peach)" }} />
        </div>
        <IconButton onClick={() => navigate("/history")} aria-label="My results">
          <span style={{ fontSize: 14 }}>≡</span>
        </IconButton>
      </div>

      <div className="results-hero relative">
        <div className="relative">
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Your Skin Analysis
          </div>
          <h1 style={{ textTransform: "capitalize" }}>{features.skin_type}</h1>
          <div className="chips">
            {chips.map((c) => (
              <span className="chip" key={c}>
                {c}
              </span>
            ))}
          </div>
          <div className="results-meter">
            <div className="icon-circle">💧</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span className="results-meter-label">Hydration Level</span>
                <span className="results-meter-label">{hydration}%</span>
              </div>
              <div className="meter-track">
                <div className="meter-fill" style={{ width: `${hydration}%` }} />
              </div>
            </div>
          </div>
          <div className="caption" style={{ marginTop: 12, color: "var(--text-50)" }}>
            AI confidence: {Math.round(features.confidence_score * 100)}%
          </div>
        </div>
      </div>

      <section className="section relative">
        <div className="section-head">
          <div className="lead">
            <h2 className="h2">Recommended</h2>
            <p>Curated for your specific profile</p>
          </div>
          <span className="see-all">See All</span>
        </div>
        {recos.length === 0 ? (
          <p className="muted">No products matched your profile yet — try adjusting your concerns.</p>
        ) : (
          <div className="product-row">
            {recos.map((item, idx) => (
              <div className="product-card" key={item.product.id}>
                <div className="image" style={{ background: PRODUCT_BG[idx % PRODUCT_BG.length] }}>
                  <span>{PRODUCT_EMOJI[item.product.category] ?? "🧴"}</span>
                </div>
                <div>
                  <div className="label">
                    {item.product.brand} · {item.product.category}
                  </div>
                  <h3>{item.product.name}</h3>
                  <ul className="reasons">
                    {item.reasons.slice(0, 3).map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </div>
                <div className="footer">
                  <span className="price">${item.product.price.toFixed(2)}</span>
                  <button className="add-btn" aria-label="Add">
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {plan && (
        <section className="section relative">
          <h2 className="h2" style={{ marginBottom: 16 }}>
            Daily Beauty Plan
          </h2>

          <div className="routine-card">
            <div className="routine-head">
              <div className="icon">☀️</div>
              <h4>Morning Routine</h4>
            </div>
            <ul className="routine-list">
              {plan.daily.morning.slice(0, 5).map((step) => (
                <li key={`m-${step.order}`}>
                  <span className="step-num">Step {step.order}</span>
                  <div className="step-body">
                    <h5>{step.product_name}</h5>
                    <p>{step.instruction}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="routine-card evening">
            <div className="routine-head">
              <div className="icon">🌙</div>
              <h4>Evening Routine</h4>
            </div>
            <ul className="routine-list">
              {plan.daily.evening.slice(0, 5).map((step) => (
                <li key={`e-${step.order}`}>
                  <span className="step-num">Step {step.order}</span>
                  <div className="step-body">
                    <h5>{step.product_name}</h5>
                    <p>{step.instruction}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <div className="screen-footer relative" style={{ background: "var(--bg-results)" }}>
        <PillButton trailingIcon={<span>→</span>}>Shop My Selection</PillButton>
      </div>
    </div>
  );
}
