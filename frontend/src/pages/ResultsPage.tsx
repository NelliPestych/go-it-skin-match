import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import IconButton from "../components/IconButton";
import PillButton from "../components/PillButton";
import {
  buildFocusAreas,
  buildInsights,
  buildSkinProfile,
  confidenceLabel,
  DEFAULT_PROFILE_METRIC_COUNT,
  displayProviderLabel,
  recommendationTagline,
} from "../lib/aiReport";
import { api } from "../services/api";
import type { AIMetricsView, BeautyPlan, RecommendationItem, SkinFeatures } from "../types";

const PRODUCT_BG = ["var(--bg-results)", "var(--cream)", "var(--rose)", "var(--mint)", "var(--sky)", "var(--lavender)"];
const PRODUCT_EMOJI: Record<string, string> = {
  cleanser: "🧴",
  moisturizer: "🪞",
  serum: "💧",
  sunscreen: "☀️",
  toner: "🌸",
  treatment: "✨",
};

/** Pick the most relevant confidence score: prefer the provider-stamped
 *  `ai_metrics.confidence_score` when present, otherwise fall back to
 *  the legacy `features.confidence_score`. */
function pickConfidence(features: SkinFeatures, metrics: AIMetricsView | null | undefined): number {
  if (metrics && typeof metrics.confidence_score === "number") return metrics.confidence_score;
  return features.confidence_score;
}

export default function ResultsPage() {
  const navigate = useNavigate();
  const { analysisId } = useParams();
  const id = Number(analysisId);
  const [recos, setRecos] = useState<RecommendationItem[] | null>(null);
  const [plan, setPlan] = useState<BeautyPlan | null>(null);
  const [features, setFeatures] = useState<SkinFeatures | null>(null);
  const [aiMetrics, setAiMetrics] = useState<AIMetricsView | null>(null);
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await api.details(id);
        if (cancelled) return;
        setFeatures(d.features);
        setAiMetrics(d.ai_metrics ?? null);
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

  // Derived view data — keep the render tree thin and memoize so we
  // don't recompute the profile / focus / insights on every keystroke
  // / interaction inside child components later.
  const profile = useMemo(
    () => (features ? buildSkinProfile(features, aiMetrics) : []),
    [features, aiMetrics],
  );
  const focusAreas = useMemo(
    () => (features ? buildFocusAreas(features, aiMetrics) : []),
    [features, aiMetrics],
  );
  const insights = useMemo(
    () => (features ? buildInsights(features, aiMetrics) : []),
    [features, aiMetrics],
  );

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

  const tier = confidenceLabel(pickConfidence(features, aiMetrics));
  const source = displayProviderLabel(aiMetrics);
  const recoTagline = recommendationTagline(focusAreas);
  const visibleProfile = showAllMetrics
    ? profile
    : profile.slice(0, DEFAULT_PROFILE_METRIC_COUNT);
  const hasHiddenMetrics = profile.length > DEFAULT_PROFILE_METRIC_COUNT;

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
          <span className="eyebrow">Your AI Skin Report</span>
          <div className="divider" style={{ background: "var(--peach)" }} />
        </div>
        <IconButton onClick={() => navigate("/history")} aria-label="My results">
          <span style={{ fontSize: 14 }}>≡</span>
        </IconButton>
      </div>

      {/* Hero + AI summary fusion — keep the original blob aesthetic
          and the capitalized skin type heading, but layer the report
          framing, the cautious tagline and the confidence pill on top.
          The hero now reads as the *summary card* of the report,
          rather than a generic title block. */}
      <div className="results-hero relative">
        <div className="relative">
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Your AI Skin Report
          </div>
          <h1 style={{ textTransform: "capitalize" }}>{features.skin_type}</h1>
          <p className="ai-tagline">
            Based on your scan and quiz answers, we built a personalized routine for your skin.
          </p>
          <span
            className="ai-confidence"
            data-tier={tier}
            aria-label={`AI confidence ${tier}, ${source}`}
          >
            <span className="dot" aria-hidden="true" />
            <span>AI confidence: {tier}</span>
            <span className="sep" aria-hidden="true">·</span>
            <span className="source">{source}</span>
          </span>
        </div>
      </div>

      {/* Focus areas — the headline takeaway of the whole report.
          Promoted above the metric grid and wrapped in a soft hero
          card so the user reads the *what to do* before the *what
          we saw*.  Larger chips, generous padding, warm gradient. */}
      <section className="section relative">
        <div className="focus-card">
          <div className="focus-card-head">
            <span className="eyebrow">What your routine should focus on</span>
            <h3>Your skin's priorities right now</h3>
            <p>A short, actionable map — the rest of the report explains the why.</p>
          </div>
          <div className="focus-chips focus-chips-lg" data-testid="focus-areas">
            {focusAreas.map((area) => (
              <span className="focus-chip focus-chip-lg" key={area}>
                <span className="focus-dot" aria-hidden="true" />
                {area}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Skin profile — 2-column metric grid.  Sorted by priority so
          the most informative rows render first.  When the full set
          would crowd the page (>5 metrics) we collapse the tail
          behind a soft "Show more" toggle — the page stays calm and
          consumer-friendly rather than dashboard-y.  Legacy mode
          shows just the 4 legacy rows; AI-powered mode adds extended
          metrics as available. */}
      <section className="section relative">
        <div className="subsection-head">
          <span className="eyebrow">Skin profile</span>
          <h3>The signals we picked up</h3>
          <p>A snapshot of how each area is reading right now.</p>
        </div>
        <div className="profile-grid" data-testid="profile-grid">
          {visibleProfile.map((row) => (
            <div
              key={row.id}
              className="profile-row"
              data-tone={row.tone}
              data-metric={row.id}
            >
              <div className="row-head">
                <span className="row-label">{row.label}</span>
                <span className="row-value">{row.valueLabel}</span>
              </div>
              <div className="meter-track">
                <div className="meter-fill" style={{ width: `${row.percent}%` }} />
              </div>
            </div>
          ))}
        </div>
        {hasHiddenMetrics && (
          <button
            type="button"
            className="show-more-btn"
            onClick={() => setShowAllMetrics((v) => !v)}
            aria-expanded={showAllMetrics}
          >
            {showAllMetrics
              ? "Show fewer"
              : `Show ${profile.length - DEFAULT_PROFILE_METRIC_COUNT} more`}
          </button>
        )}
      </section>

      {/* Personalized insights — 2–3 hedged, friendly sentences. */}
      <section className="section relative">
        <div className="subsection-head">
          <span className="eyebrow">Personalized insights</span>
          <h3>What this may mean for you</h3>
        </div>
        {insights.map((line, idx) => (
          <div className="insight-card" key={idx}>
            <div className="insight-icon" aria-hidden="true">
              ✨
            </div>
            <p>{line}</p>
          </div>
        ))}
      </section>

      {/* Recommendations — keep the existing horizontal product row;
          improve the lead-in copy so the user sees the link between
          their AI focus areas and the picks. */}
      <section className="section relative">
        <div className="section-head">
          <div className="lead">
            <h2 className="h2">Recommended</h2>
            <p>{recoTagline}</p>
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

      <div className="screen-footer relative">
        <PillButton trailingIcon={<span>→</span>}>Shop My Selection</PillButton>
      </div>
    </div>
  );
}
