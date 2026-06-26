import { useNavigate } from "react-router-dom";

import IconButton from "../components/IconButton";
import PillButton from "../components/PillButton";
import styles from "./HomePage.module.css";

/** Landing screen — single-viewport on iPhone portrait. */
export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className={`screen ${styles["intro-screen"]}`}>
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

      <div className={styles["intro-copy"]}>
        <h1 className={styles["intro-headline"]}>
          Your skin,
          <br />
          <span className={styles["intro-headline-em"]}>decoded.</span>
        </h1>
        <p className={styles["intro-subhead"]}>
          Snap a selfie, answer a few questions – get a routine made for your
          skin.
        </p>
      </div>

      <div className={styles["intro-chips"]} aria-label="Key benefits">
        <span className={styles["intro-chip"]}>
          <span className={styles["intro-chip-icon"]}>⚡</span>AI scan
        </span>
        <span className={styles["intro-chip"]}>
          <span className={styles["intro-chip-icon"]}>🧴</span>Your routine
        </span>
        <span className={styles["intro-chip"]}>
          <span className={styles["intro-chip-icon"]}>🔬</span>Science-backed
        </span>
      </div>

      <div className={`screen-footer ${styles["intro-footer"]}`}>
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

/** Hero — face-mesh portrait image + bottom fade + animated scan-line. */
function IntroHero() {
  return (
    <div className={styles["intro-hero"]} aria-hidden="true">
      <img
        src="/intro-face-mesh.png"
        alt=""
        className={styles["intro-hero-image"]}
        draggable={false}
      />
      <div className={styles["intro-hero-fade"]} />
      <div className={styles["intro-hero-scanline"]} />
    </div>
  );
}
