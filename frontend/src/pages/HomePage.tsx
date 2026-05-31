import { useNavigate } from "react-router-dom";

import IconButton from "../components/IconButton";
import PillButton from "../components/PillButton";

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
 * The header's ≡ menu icon mirrors the one in ResultsPage and
 * navigates to the history list — that's the single, consistent
 * "see my past results" affordance across the app.
 */
export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="screen intro-screen">
      <div className="app-header">
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <span
            style={{
              width: 35,
              height: 35,
              borderRadius: 9999,
              background: "var(--rose)",
              color: "var(--text)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Same four-point sparkle (large + small companion) used
                as the Insights tab bullet — keeps the brand glyph
                consistent between the landing screen and the
                "premium insight" surface inside the report. */}
            <svg width="22" height="22" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true" style={{ marginLeft: -2 }}>
              <path d="M7 0c.3 2.4 1.3 4 3.6 4.6.2.06.2.34 0 .4C8.3 5.7 7.3 7.2 7 9.6 6.7 7.2 5.7 5.7 3.4 5c-.2-.06-.2-.34 0-.4C5.7 4 6.7 2.4 7 0Z" />
              <path d="M11.6 8.4c.15 1.2.65 2 1.8 2.3.1.03.1.17 0 .2-1.15.3-1.65 1.1-1.8 2.3-.15-1.2-.65-2-1.8-2.3-.1-.03-.1-.17 0-.2 1.15-.3 1.65-1.1 1.8-2.3Z" />
            </svg>
          </span>
          <span
            className="font-serif"
            style={{ fontWeight: 700, fontSize: 20, letterSpacing: -0.5 }}
          >
            SkinMatch
          </span>
        </div>
        <IconButton onClick={() => navigate("/history")} aria-label="My results">
          <span style={{ fontSize: 14 }}>≡</span>
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
          Snap a selfie, answer a few questions – get a routine made for your
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
