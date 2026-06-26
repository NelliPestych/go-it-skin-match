import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import IconButton from "../components/IconButton";
import PillButton from "../components/PillButton";
import {
  buildFocusAreas,
  buildInsights,
  buildSkinProfile,
  confidenceExplainer,
  confidenceLabel,
  DEFAULT_PROFILE_METRIC_COUNT,
  displayProviderLabel,
  type FocusArea,
  recommendationTagline,
} from "../lib/aiReport";
import { api, isUnauthorized } from "../services/api";
import type { AIMetricsView, BeautyPlan, RecommendationItem, SkinFeatures } from "../types";
import styles from "./ResultsPage.module.css";

type ResultsTab = "targets" | "picks" | "routine" | "profile" | "insights";
type RoutinePeriod = "morning" | "evening";

const tabId = (t: ResultsTab) => `results-tab-${t}`;
const panelId = (t: ResultsTab) => `results-panel-${t}`;

const PRODUCT_BG = ["var(--bg-results)", "var(--cream)", "var(--rose)", "var(--mint)", "var(--sky)", "var(--lavender)"];
const PRODUCT_EMOJI: Record<string, string> = {
  cleanser: "🧴",
  moisturizer: "🪞",
  serum: "💧",
  sunscreen: "☀️",
  toner: "🌸",
  treatment: "✨",
};

const CONFIDENCE_HINT =
  "How confident the AI is in this analysis, based on your scan quality and quiz answers.";

/** Substrings for filtering Picks by Targets; generous on synonyms ("dehydration" → "hydrat"). */
const TARGET_KEYWORDS: Record<FocusArea, string[]> = {
  "Oil control": ["oil", "shine", "sebum"],
  "Hydration support": ["hydrat", "moistur", "dry", "dehydrat"],
  "Barrier support": ["barrier", "redness", "sensitive", "calm"],
  "Texture smoothing": ["texture", "smooth", "fine line"],
  "Pore care": ["pore"],
  "Breakout support": ["acne", "breakout", "blemish", "spot"],
  "Tone balance": ["pigment", "tone", "dark spot", "brighten"],
  "Daily SPF support": ["sun", "spf", "uv"],
};

function matchesTarget(item: RecommendationItem, target: FocusArea): boolean {
  const keys = TARGET_KEYWORDS[target] ?? [];
  const haystack = [
    item.product.category,
    item.product.name,
    ...item.product.concerns,
    ...item.reasons,
  ]
    .join(" ")
    .toLowerCase();
  return keys.some((k) => haystack.includes(k));
}

function pickConfidence(features: SkinFeatures, metrics: AIMetricsView | null | undefined): number {
  if (metrics && typeof metrics.confidence_score === "number") return metrics.confidence_score;
  return features.confidence_score;
}

export default function ResultsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { analysisId } = useParams();
  const id = Number(analysisId);
  const [recos, setRecos] = useState<RecommendationItem[] | null>(null);
  const [plan, setPlan] = useState<BeautyPlan | null>(null);
  const [features, setFeatures] = useState<SkinFeatures | null>(null);
  const [aiMetrics, setAiMetrics] = useState<AIMetricsView | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const [tab, setTab] = useState<ResultsTab>("profile");
  const [routinePeriod, setRoutinePeriod] = useState<RoutinePeriod>("morning");
  const [activeTarget, setActiveTarget] = useState<FocusArea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metersIn, setMetersIn] = useState(false);
  // Saved-toast fires once per analysisId; persisted in localStorage.
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [confidenceInfoOpen, setConfidenceInfoOpen] = useState(false);
  const confidenceInfoRef = useRef<HTMLSpanElement | null>(null);

  // Drag-to-scroll for Picks carousel (mouse/pen only; touch uses native pan).
  const recoRowRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({
    active: false,
    startX: 0,
    scrollStart: 0,
    moved: 0,
  });

  const onRowPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return; // let native pan-x handle touch
    const row = recoRowRef.current;
    if (!row) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      scrollStart: row.scrollLeft,
      moved: 0,
    };
    row.setPointerCapture(e.pointerId);
  };

  const onRowPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const row = recoRowRef.current;
    if (!row) return;
    const dx = e.clientX - dragRef.current.startX;
    dragRef.current.moved = Math.max(dragRef.current.moved, Math.abs(dx));
    row.scrollLeft = dragRef.current.scrollStart - dx;
  };

  const onRowPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    try {
      recoRowRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // pointerId may already be released by the browser — ignore
    }
  };

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
        setCreatedAt(d.created_at ?? null);
      } catch (err) {
        // 401 → AuthProvider redirects; skip the flash error.
        if (cancelled || isUnauthorized(err)) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Sweep meters from 0 → target one frame after paint.
  useEffect(() => {
    if (!features) return;
    const t = requestAnimationFrame(() => setMetersIn(true));
    return () => cancelAnimationFrame(t);
  }, [features]);

  // Dismiss the confidence tooltip on outside click or Escape.
  useEffect(() => {
    if (!confidenceInfoOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!confidenceInfoRef.current?.contains(e.target as Node)) {
        setConfidenceInfoOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfidenceInfoOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [confidenceInfoOpen]);

  // Toast only on first-visit-from-/analyzing; strip the flag so refresh doesn't replay.
  useEffect(() => {
    const state = location.state as { fromAnalyzing?: boolean } | null;
    if (state?.fromAnalyzing) {
      setShowSavedToast(true);
      navigate(location.pathname, { replace: true, state: null });
    }
    // Depend on pathname only — state identity would clear the flag too early.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

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
          <div className="skeleton" style={{ height: 140, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 40, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 240, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 180 }} />
        </div>
      </div>
    );
  }

  const confidence = pickConfidence(features, aiMetrics);
  const tier = confidenceLabel(confidence);
  const score = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  const source = displayProviderLabel(aiMetrics);
  const confidenceInfo = confidenceExplainer(tier, source === "AI-powered analysis");
  const recoTagline = recommendationTagline(focusAreas);
  const filteredRecos = activeTarget
    ? recos.filter((item) => matchesTarget(item, activeTarget))
    : recos;
  const visibleProfile = showAllMetrics
    ? profile
    : profile.slice(0, DEFAULT_PROFILE_METRIC_COUNT);
  const hasHiddenMetrics = profile.length > DEFAULT_PROFILE_METRIC_COUNT;
  const hasPlan = Boolean(plan);
  const routineSteps =
    plan && routinePeriod === "morning" ? plan.daily.morning : plan?.daily.evening ?? [];
  const scanDate = createdAt
    ? new Date(createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  // r=34 → circumference for the score-ring entrance animation.
  const RING_C = 2 * Math.PI * 34;
  const ringTarget = RING_C * (1 - score / 100);

  return (
    <div className={`screen ${styles["results-v2"]}`} style={{ background: "var(--bg-results)" }}>
      <div className="app-header app-header--flush">
        <IconButton onClick={() => navigate("/")} aria-label="Back">
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
            <path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </IconButton>
        <span className={styles["results-eyebrow"]}>Skin Report</span>
        <IconButton onClick={() => navigate("/history")} aria-label="My results">
          <span style={{ fontSize: 14 }}>≡</span>
        </IconButton>
      </div>

      <main className={styles["results-body"]}>
        <section className={styles["results-summary"]}>
          <div className={styles["results-summary-glow"]} aria-hidden="true" />
          <div className={styles["results-summary-row"]}>
            <div
              className={styles["score-ring"]}
              data-tier={tier}
              role="img"
              aria-label={`Scan score ${score} out of 100`}
              title={CONFIDENCE_HINT}
            >
              <svg viewBox="0 0 80 80" width="80" height="80">
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#b9ebb5" />
                    <stop offset="25%" stopColor="#ffdf9b" />
                    <stop offset="50%" stopColor="#fbc8c8" />
                    <stop offset="75%" stopColor="#c8b3f0" />
                    <stop offset="100%" stopColor="#a4d6f3" />
                  </linearGradient>
                </defs>
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  className={styles["score-ring-track"]}
                  fill="none"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  className={styles["score-ring-fill"]}
                  fill="none"
                  stroke="url(#scoreGrad)"
                  strokeDasharray={RING_C}
                  strokeDashoffset={metersIn ? ringTarget : RING_C}
                  transform="rotate(-90 40 40)"
                />
              </svg>
              <div className={styles["score-ring-center"]}>
                <span className={styles["score-ring-value"]}>{score}</span>
                <span className={styles["score-ring-unit"]}>/100</span>
              </div>
              <span className={styles["score-ring-caption"]}>AI Score</span>
            </div>
            <div className={styles["results-summary-text"]}>
              <span className={styles["results-summary-label"]}>Your skin type</span>
              <h1 className={styles["results-title"]}>{features.skin_type}</h1>
            </div>
          </div>
          <div className={styles["results-meta-row"]}>
            <div
              className={styles["results-meta"]}
              data-tier={tier}
              title={CONFIDENCE_HINT}
              aria-label={`Confidence ${tier}, ${source}`}
            >
              <span className={styles["results-meta-dot"]} aria-hidden="true" />
              <span>Confidence: {tier}</span>
              <span className={styles["results-meta-sep"]} aria-hidden="true">·</span>
              <span className={styles["results-meta-source"]}>{source}</span>
              <span className={styles["results-info"]} ref={confidenceInfoRef}>
                <button
                  type="button"
                  className={styles["results-info-btn"]}
                  aria-label="What does this mean?"
                  aria-expanded={confidenceInfoOpen}
                  title="Click to learn more"
                  onClick={() => setConfidenceInfoOpen((v) => !v)}
                >
                  ?
                </button>
                {confidenceInfoOpen && (
                  <span className={styles["results-info-pop"]} role="dialog" aria-label="What this means">
                    {confidenceInfo}
                  </span>
                )}
              </span>
            </div>
            {scanDate && (
              <span className={styles["results-meta-date"]}>Scanned {scanDate}</span>
            )}
          </div>
        </section>

        <div className={styles["seg-tabs"]} role="tablist" aria-label="Report sections">
          {(
            [
              { id: "profile" as const, label: "Profile" },
              { id: "targets" as const, label: "Targets" },
              { id: "picks" as const, label: "Picks" },
              ...(hasPlan ? [{ id: "routine" as const, label: "Routine" }] : []),
              { id: "insights" as const, label: "Insights" },
            ]
          ).map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              className={styles["seg-tab"]}
              id={tabId(t.id)}
              aria-selected={tab === t.id}
              aria-controls={panelId(t.id)}
              tabIndex={tab === t.id ? 0 : -1}
              data-active={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <section
          className={styles["tab-panel"]}
          role="tabpanel"
          id={panelId("targets")}
          aria-labelledby={tabId("targets")}
          hidden={tab !== "targets"}
        >
          <p className={styles["targets-tag"]}>
            Tap a target to see picks that match it.
          </p>
          <ul className={styles["targets-list"]} data-testid="focus-areas">
            {focusAreas.map((area, idx) => (
              <li key={area}>
                <button
                  type="button"
                  className={styles["targets-item"]}
                  onClick={() => {
                    setActiveTarget(area);
                    setTab("picks");
                  }}
                >
                  <span className={styles["targets-index"]} aria-hidden="true">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className={styles["targets-label"]}>{area}</span>
                  <span className={styles["targets-arrow"]} aria-hidden="true">→</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section
          className={styles["tab-panel"]}
          role="tabpanel"
          id={panelId("picks")}
          aria-labelledby={tabId("picks")}
          aria-live="polite"
          hidden={tab !== "picks"}
        >
          <div className={styles["recos-head"]}>
            <h2 className={styles["recos-title"]}>Recommended</h2>
            {activeTarget && (
              <button
                type="button"
                className={styles["recos-link"]}
                onClick={() => setActiveTarget(null)}
              >
                Clear filter
              </button>
            )}
          </div>
          <p className={styles["recos-tag"]}>
            {activeTarget ? `Picks for ${activeTarget.toLowerCase()}.` : recoTagline}
          </p>
          {activeTarget && (
            <div className={styles["picks-filter"]}>
              <span className={styles["picks-filter-label"]}>Filter:</span>
              <span className={styles["picks-filter-chip"]}>
                {activeTarget}
                <button
                  type="button"
                  className={styles["picks-filter-clear"]}
                  onClick={() => setActiveTarget(null)}
                  aria-label="Clear filter"
                >
                  ×
                </button>
              </span>
            </div>
          )}
          {filteredRecos.length === 0 ? (
            <p className="muted">
              {activeTarget
                ? `No picks match ${activeTarget.toLowerCase()} yet. Try another target.`
                : "No products matched your profile yet — try adjusting your concerns."}
            </p>
          ) : (
            <div
              className={styles["reco-row"]}
              ref={recoRowRef}
              onPointerDown={onRowPointerDown}
              onPointerMove={onRowPointerMove}
              onPointerUp={onRowPointerUp}
              onPointerCancel={onRowPointerUp}
            >
              {filteredRecos.map((item, idx) => (
                <button
                  type="button"
                  className={styles["reco-card"]}
                  key={item.product.id}
                  // Tap → scroll the row directly (not scrollIntoView, which leaks to body scroll).
                  // Suppress when the click was the tail of a drag gesture (>5px).
                  onClick={(e) => {
                    if (dragRef.current.moved > 5) {
                      dragRef.current.moved = 0;
                      return;
                    }
                    const row = recoRowRef.current;
                    if (!row) return;
                    // 20px = .reco-row scroll-padding-left.
                    const target = e.currentTarget.offsetLeft - 20;
                    row.scrollTo({ left: target, behavior: "smooth" });
                  }}
                  aria-label={`${item.product.brand} ${item.product.name}, $${item.product.price.toFixed(2)}`}
                >
                  <div
                    className={styles["reco-image"]}
                    style={{ background: PRODUCT_BG[idx % PRODUCT_BG.length] }}
                  >
                    <span>{PRODUCT_EMOJI[item.product.category] ?? "🧴"}</span>
                  </div>
                  <div className={styles["reco-meta"]}>
                    <span className={styles["reco-brand"]}>{item.product.brand}</span>
                    <h3 className={styles["reco-name"]}>{item.product.name}</h3>
                    {item.reasons[0] && (
                      <span className={styles["reco-why"]} title={item.reasons[0]}>
                        Why: {item.reasons[0]}
                      </span>
                    )}
                    <span className={styles["reco-price"]}>${item.product.price.toFixed(2)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {hasPlan && plan && (
          <section
            className={styles["tab-panel"]}
            role="tabpanel"
            id={panelId("routine")}
            aria-labelledby={tabId("routine")}
            hidden={tab !== "routine"}
          >
            <div className={styles["routine-header"]}>
              <h3 className={styles["routine-period-title"]}>
                {routinePeriod === "morning" ? "Morning" : "Evening"}
              </h3>
              <div
                className={`${styles["period-switch"]} ${styles["period-switch--icon-only"]}`}
                role="tablist"
                aria-label="Time of day"
              >
                <button
                  type="button"
                  role="tab"
                  className={styles["period-switch-btn"]}
                  aria-selected={routinePeriod === "morning"}
                  aria-label="Morning routine"
                  data-active={routinePeriod === "morning"}
                  onClick={() => setRoutinePeriod("morning")}
                >
                  <span className={styles["period-switch-icon"]} aria-hidden="true">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    >
                      <circle cx="8" cy="8" r="3" />
                      <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
                    </svg>
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  className={styles["period-switch-btn"]}
                  aria-selected={routinePeriod === "evening"}
                  aria-label="Evening routine"
                  data-active={routinePeriod === "evening"}
                  onClick={() => setRoutinePeriod("evening")}
                >
                  <span className={styles["period-switch-icon"]} aria-hidden="true">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    >
                      <path d="M13.2 9.6A5.5 5.5 0 1 1 6.4 2.8a4.4 4.4 0 0 0 6.8 6.8Z" />
                    </svg>
                  </span>
                </button>
              </div>
            </div>
            <ol className={styles["routine-steps"]}>
              {routineSteps.slice(0, 5).map((step) => (
                <li key={`${routinePeriod}-${step.order}`}>
                  <div className={styles["routine-step-body"]}>
                    <span className={styles["routine-step-name"]}>{step.product_name}</span>
                    <span className={styles["routine-step-hint"]}>{step.instruction}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section
          className={styles["tab-panel"]}
          role="tabpanel"
          id={panelId("profile")}
          aria-labelledby={tabId("profile")}
          hidden={tab !== "profile"}
        >
          <div className={styles["profile-grid"]} data-testid="profile-grid">
            {visibleProfile.map((row) => (
              <div
                key={row.id}
                className={styles["profile-row"]}
                data-tone={row.tone}
                data-metric={row.id}
              >
                <div className={styles["row-head"]}>
                  <span className={styles["row-label"]} title={row.label}>{row.label}</span>
                  <span className={styles["row-value"]}>{row.valueLabel}</span>
                </div>
                <div className={styles["meter-track"]}>
                  <div
                    className={styles["meter-fill"]}
                    style={{ width: `${metersIn ? row.percent : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {hasHiddenMetrics && (
            <button
              type="button"
              className={styles["show-more-btn"]}
              onClick={() => setShowAllMetrics((v) => !v)}
              aria-expanded={showAllMetrics}
            >
              {showAllMetrics
                ? "Show fewer"
                : `Show ${profile.length - DEFAULT_PROFILE_METRIC_COUNT} more`}
            </button>
          )}
        </section>

        <section
          className={styles["tab-panel"]}
          role="tabpanel"
          id={panelId("insights")}
          aria-labelledby={tabId("insights")}
          hidden={tab !== "insights"}
        >
          <ul className={styles["insights-list"]}>
            {insights.map((line, idx) => (
              <li key={idx} className={styles["insights-item"]}>
                <span className={styles["insights-bullet"]} aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 14 14" fill="currentColor">
                    <path d="M7 0c.3 2.4 1.3 4 3.6 4.6.2.06.2.34 0 .4C8.3 5.7 7.3 7.2 7 9.6 6.7 7.2 5.7 5.7 3.4 5c-.2-.06-.2-.34 0-.4C5.7 4 6.7 2.4 7 0Z" />
                    <path d="M11.6 8.4c.15 1.2.65 2 1.8 2.3.1.03.1.17 0 .2-1.15.3-1.65 1.1-1.8 2.3-.15-1.2-.65-2-1.8-2.3-.1-.03-.1-.17 0-.2 1.15-.3 1.65-1.1 1.8-2.3Z" />
                  </svg>
                </span>
                <p>{line}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className={styles["results-bottom-spacer"]} aria-hidden="true" />
      </main>

      <div className={styles["results-sticky"]}>
        {showSavedToast && (
          <div className={styles["results-saved"]} aria-hidden="true">
            <span className={styles["results-saved-check"]}>
              <svg
                width="10"
                height="10"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 7 L6 10 L11 4" pathLength="100" />
              </svg>
            </span>
            Saved to your history
          </div>
        )}
        <PillButton
          trailingIcon={<span aria-hidden="true">→</span>}
          onClick={() => {
            setTab("picks");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          Shop My Selection
        </PillButton>
      </div>
    </div>
  );
}
