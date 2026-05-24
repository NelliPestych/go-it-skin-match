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
 * Hero visual — photographic face-mesh portrait + animated scan line.
 *
 * Composition (back to front):
 *   1. `/intro-face-mesh.png` (in `public/`) — a portrait photo with
 *      an AI face-mesh overlay baked in. This is the primary visual:
 *      it communicates "AI skin analysis" instantly without copy.
 *   2. A soft bottom-edge fade — blends the bottom of the photo into
 *      the cream page background so the hero doesn't read as a
 *      hard-edged card sitting on the layout.
 *   3. A slow scan-line that travels top → bottom over the photo,
 *      reinforcing the "currently scanning" feel. CSS keyframe,
 *      paused under `prefers-reduced-motion: reduce`.
 *
 * The image is loaded eagerly (default) because it IS the first
 * paint — lazy-loading would create a flash. ~860 kB PNG; an
 * acceptable cost for the landing screen and easily re-encodable
 * to ~200 kB WebP later if perf telemetry asks for it.
 */
function IntroHero() {
  return (
    <div className="intro-hero" aria-hidden="true">
      <img
        src="/intro-face-mesh.png"
        alt=""
        className="intro-hero-image"
        draggable={false}
      />
      <div className="intro-hero-fade" />
      <div className="intro-hero-scanline" />
    </div>
  );
}
