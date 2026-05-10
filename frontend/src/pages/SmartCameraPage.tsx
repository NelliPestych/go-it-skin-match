/**
 * Smart Camera page — full LRP-style guided 3-shot capture.
 *
 * Composes:
 *   hooks
 *     useWebcam              — getUserMedia lifecycle
 *     useFaceMesh            — MediaPipe FaceLandmarker (478 pts)
 *     useLightingValidation  — 4 Hz luminance sampler
 *     useSmartCaptureFlow    — warmup → countdown → flash → done
 *
 *   pure
 *     evaluateGates          — independent per-gate booleans
 *     evaluateGuidance       — single dominant message + passes
 *
 *   components
 *     CameraStatusPanel      — top: 3 chips + close
 *     FaceOvalOverlay        — canvas (oval + mesh + scan line)
 *     GuidanceText           — big text above oval (only on fail)
 *     CountdownOverlay       — big 3 / 2 / 1 in centre
 *     CaptureProgress        — bottom: 3 pose-silhouette dots
 *
 * The page itself is a thin orchestrator:
 *   1. Start the camera, surface the <video> element.
 *   2. Run face + lighting hooks against it.
 *   3. Compute report/gates from face + lighting + current pose.
 *   4. Drive the capture flow off `report.passes`.
 *   5. Render the final triptych review when session.complete.
 *
 * Backend integration (Continue → /quiz/skin-type with imageFile)
 * lands in commit #11.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import CameraStatusPanel from "../components/camera/CameraStatusPanel";
import CaptureProgress from "../components/camera/CaptureProgress";
import CountdownOverlay from "../components/camera/CountdownOverlay";
import FaceOvalOverlay from "../components/camera/FaceOvalOverlay";
import GuidanceText from "../components/camera/GuidanceText";
import IconButton from "../components/IconButton";
import PillButton from "../components/PillButton";
import { useFaceMesh } from "../hooks/useFaceMesh";
import { useLightingValidation } from "../hooks/useLightingValidation";
import { useSmartCaptureFlow } from "../hooks/useSmartCaptureFlow";
import { useWebcam } from "../hooks/useWebcam";
import { evaluateGates, evaluateGuidance } from "../lib/cameraGuidance";
import type { CaptureStep } from "../types/camera";

const POSE_HINT: Record<CaptureStep, string> = {
  front: "Look at the screen",
  left: "Turn your face left",
  right: "Turn your face right",
};

export default function SmartCameraPage() {
  const navigate = useNavigate();
  const { status: camStatus, videoRef, restart } = useWebcam();

  // Surface the live <video> to face / lighting / capture hooks.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const composedRef = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl(el);
  };

  const cameraReady = camStatus.kind === "ready";
  const face = useFaceMesh(videoEl, cameraReady);
  const lighting = useLightingValidation(videoEl, cameraReady);

  // The capture flow needs `passes` (computed from face + lighting +
  // pose), but `pose` is owned BY the flow. We break the cycle with
  // a ref written at the end of each render — the hook's effect runs
  // after commit and picks up the latest value, with a 1-frame lag
  // that's imperceptible at 60 fps.
  const passesRef = useRef(false);
  const captureEnabled = cameraReady && !face.error;
  const session = useSmartCaptureFlow(videoEl, passesRef.current, captureEnabled);

  const gates = evaluateGates(face, lighting, session.pose);
  const report = evaluateGuidance(face, lighting, session.pose);
  passesRef.current = report.passes;

  const overlayState = !face.hasFace
    ? "scanning"
    : report.passes
    ? "pass"
    : "fail";

  // Object-URLs for review thumbnails. useMemo allocates once per
  // `session.images` change; the cleanup effect revokes them on the
  // next allocation (and on unmount).
  const thumbUrls = useMemo(
    () => ({
      front: session.images.front ? URL.createObjectURL(session.images.front) : null,
      left: session.images.left ? URL.createObjectURL(session.images.left) : null,
      right: session.images.right ? URL.createObjectURL(session.images.right) : null,
    }),
    [session.images],
  );
  useEffect(() => {
    return () => {
      Object.values(thumbUrls).forEach((u) => u && URL.revokeObjectURL(u));
    };
  }, [thumbUrls]);

  // ── Final review (light cream theme, à la LRP) ─────────────────
  if (session.complete) {
    return (
      <div className="sc-review-screen">
        <div className="app-header">
          <span style={{ width: 40 }} />
          <span style={{ width: 40 }} />
          <IconButton onClick={() => navigate("/capture")} aria-label="Close">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path
                d="M1 1l8 8M9 1L1 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </IconButton>
        </div>

        <div className="sc-review-thumbs">
          {(["front", "left", "right"] as CaptureStep[]).map((p) => (
            <figure className="sc-review-thumb" key={p}>
              {thumbUrls[p] && <img src={thumbUrls[p] ?? ""} alt={`${p} capture`} />}
              <figcaption>{p}</figcaption>
            </figure>
          ))}
        </div>

        <div className="sc-review-text">
          <div className="sc-review-headline">
            <span className="sc-review-check" aria-hidden="true">
              ✓
            </span>
            <span>All set</span>
          </div>
          <p>Your photos are ready for analysis.</p>
        </div>

        <div style={{ flex: 1 }} />

        <div className="screen-footer" style={{ background: "transparent" }}>
          {/* Backend wiring lands in commit #11. */}
          <PillButton
            onClick={() => {
              // eslint-disable-next-line no-alert
              alert("Backend integration lands in commit #11");
            }}
          >
            Continue
          </PillButton>
          <div style={{ height: 12 }} />
          <PillButton variant="secondary" onClick={session.reset}>
            Take photos again
          </PillButton>
        </div>
      </div>
    );
  }

  // ── Active capture ─────────────────────────────────────────────
  return (
    <div className="sc-screen">
      {cameraReady && !face.error && (
        <CameraStatusPanel
          gates={gates}
          pose={session.pose}
          onClose={() => navigate("/capture")}
        />
      )}

      <div className="sc-stage">
        <video
          ref={composedRef}
          autoPlay
          playsInline
          muted
          className="sc-video"
          data-visible={cameraReady}
        />
        {cameraReady && (
          <FaceOvalOverlay
            landmarksRef={face.landmarksRef}
            hasFace={face.hasFace}
            state={overlayState}
          />
        )}

        {camStatus.kind === "starting" && (
          <div className="sc-overlay">
            <div className="sc-spinner" />
            <p className="sc-overlay-text">Starting camera…</p>
          </div>
        )}

        {camStatus.kind === "error" && (
          <div className="sc-overlay">
            <div className="sc-overlay-icon" aria-hidden="true">
              📷
            </div>
            <p className="sc-error-title">Camera unavailable</p>
            <p className="sc-error-body">{camStatus.message}</p>
            {camStatus.recoverable && (
              <button className="sc-retry" onClick={restart}>
                Try again
              </button>
            )}
          </div>
        )}

        {cameraReady && !face.error && (
          <>
            <GuidanceText report={report} hint={POSE_HINT[session.pose]} />
            <CountdownOverlay digit={session.countdownDigit} />
          </>
        )}

        {session.status === "flash" && <div className="sc-flash" />}
      </div>

      {cameraReady && !face.error && (
        <CaptureProgress pose={session.pose} images={session.images} />
      )}

      <div className="sc-footer">
        <button className="sc-fallback" onClick={() => navigate("/capture")}>
          Upload photo instead
        </button>
      </div>
    </div>
  );
}
