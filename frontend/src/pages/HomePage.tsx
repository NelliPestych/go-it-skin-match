import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import IconButton from "../components/IconButton";
import PillButton from "../components/PillButton";
import { api } from "../services/api";

/**
 * Landing screen.
 *
 * Single-viewport layout (no scroll on iPhone 12/13/14 portrait):
 *   header → hero visual → headline → subhead → benefit chips → CTA.
 *
 * The hero visual is a CSS-only "skin scan" composition: a gradient
 * card with concentric scan rings, a subtle vertical face hint, and
 * a slow shimmer line that travels top-to-bottom. The animation
 * respects `prefers-reduced-motion`.
 *
 * The "View my results" link is rendered only when the analysis
 * history is non-empty — first-time visitors don't see a dead link
 * pointing to an empty page. The fetch is fire-and-forget; if the
 * backend is down we silently hide the link.
 */
export default function HomePage() {
  const navigate = useNavigate();
  const [hasHistory, setHasHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .history()
      .then((items) => {
        if (!cancelled) setHasHistory(items.length > 0);
      })
      .catch(() => {
        // Backend unreachable — hide the secondary link to avoid
        // routing the user into an error state from the home screen.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
          <span
            className="font-serif"
            style={{ fontWeight: 700, fontSize: 20, letterSpacing: -0.5 }}
          >
            SkinMatch
          </span>
        </div>
        <IconButton aria-label="Menu">
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
            <path
              d="M1 1h12M1 5h12M1 9h12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </IconButton>
      </div>

      <IntroHero />

      <div className="intro-copy">
        <h1 className="intro-headline">
          Your skin,
          <br />
          <span className="intro-headline-em">decoded.</span>
        </h1>
        <p className="intro-subhead">
          Snap a selfie, answer a few questions — get a routine made for your
          skin.
        </p>
      </div>

      <div className="intro-chips" aria-label="Key benefits">
        <span className="intro-chip">
          <span className="intro-chip-icon">⚡</span>AI scan
        </span>
        <span className="intro-chip">
          <span className="intro-chip-icon">🧴</span>Your routine
        </span>
        <span className="intro-chip">
          <span className="intro-chip-icon">🔬</span>Science-backed
        </span>
      </div>

      <div style={{ flex: 1 }} />

      <div className="screen-footer intro-footer">
        <PillButton
          onClick={() => navigate("/capture")}
          trailingIcon={<span aria-hidden>→</span>}
        >
          Scan my skin
        </PillButton>
        {hasHistory && (
          <button
            onClick={() => navigate("/history")}
            className="text-link"
            style={{ display: "block", margin: "12px auto 0" }}
          >
            View my results
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Hero visual — pure CSS / inline SVG, no external assets.
 *
 * Composition (back to front):
 *   1. Gradient card background (rose → lavender → cream, diagonal).
 *   2. Two blurred glow blobs in opposite corners.
 *   3. Three concentric scan rings, sized from large → small, drawn
 *      as SVG strokes so the line weight stays crisp on any DPR.
 *   4. A subtle vertical oval — the "face hint" — with four small
 *      mesh dots at eye / nose-bridge / mouth positions. Communicates
 *      "skin scan" without depicting a literal face.
 *   5. A slow scan-line that translates top-to-bottom over the whole
 *      composition (CSS keyframe, paused under prefers-reduced-motion).
 */
function IntroHero() {
  return (
    <div className="intro-hero" aria-hidden="true">
      <div className="intro-hero-glow intro-hero-glow-top" />
      <div className="intro-hero-glow intro-hero-glow-bottom" />

      <svg
        className="intro-hero-svg"
        viewBox="0 0 200 240"
        preserveAspectRatio="xMidYMid meet"
        fill="none"
      >
        {/* Concentric scan rings — outer → inner. */}
        <ellipse
          cx="100"
          cy="120"
          rx="88"
          ry="108"
          stroke="rgba(26,26,26,0.18)"
          strokeWidth="1"
          strokeDasharray="3 5"
        />
        <ellipse
          cx="100"
          cy="120"
          rx="70"
          ry="88"
          stroke="rgba(26,26,26,0.22)"
          strokeWidth="1"
        />
        <ellipse
          cx="100"
          cy="120"
          rx="52"
          ry="68"
          stroke="rgba(26,26,26,0.28)"
          strokeWidth="1.2"
        />

        {/* Face hint — softer vertical oval at the centre. */}
        <ellipse
          cx="100"
          cy="120"
          rx="36"
          ry="50"
          stroke="rgba(26,26,26,0.55)"
          strokeWidth="1.4"
        />

        {/* Mesh dots — eye / eye / nose-bridge / mouth. */}
        <circle cx="86" cy="108" r="1.6" fill="rgba(26,26,26,0.6)" />
        <circle cx="114" cy="108" r="1.6" fill="rgba(26,26,26,0.6)" />
        <circle cx="100" cy="124" r="1.4" fill="rgba(26,26,26,0.5)" />
        <circle cx="100" cy="146" r="1.4" fill="rgba(26,26,26,0.5)" />
      </svg>

      <div className="intro-hero-scanline" />
    </div>
  );
}
