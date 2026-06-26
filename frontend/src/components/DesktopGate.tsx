import { ReactNode, useEffect, useState } from "react";

import styles from "./DesktopGate.module.css";

/**
 * Mobile-only gate. At/above MIN_DESKTOP_WIDTH the app is hidden behind a
 * "open on your phone" screen with a static QR code. Detection is purely
 * viewport-width based via matchMedia, so resizing / DevTools emulation
 * flips it live. Below the threshold, children render untouched.
 */
const MIN_DESKTOP_WIDTH = 768;
const QUERY = `(min-width: ${MIN_DESKTOP_WIDTH}px)`;

export default function DesktopGate({ children }: { children: ReactNode }) {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    setIsDesktop(mq.matches); // sync in case it changed before listener attached
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (!isDesktop) return <>{children}</>;

  return (
    <div
      className={styles["desktop-gate"]}
      role="dialog"
      aria-modal="true"
      aria-labelledby="desktop-gate-title"
    >
      <div className={styles["desktop-gate-card"]}>
        <span className={styles["desktop-gate-eyebrow"]}>SkinMatch</span>
        <h1 id="desktop-gate-title" className={styles["desktop-gate-title"]}>
          Open on your phone
        </h1>
        <p className={styles["desktop-gate-text"]}>
          SkinMatch is designed for mobile — your camera scan and personalised
          results work best on a smartphone. Scan the code to continue on your
          phone.
        </p>
        <img
          className={styles["desktop-gate-qr"]}
          src="/app-qr.svg"
          width={200}
          height={200}
          alt="QR code that opens SkinMatch on your phone"
        />
        <span className={styles["desktop-gate-url"]}>go-it-skin-match.vercel.app</span>
      </div>
    </div>
  );
}
