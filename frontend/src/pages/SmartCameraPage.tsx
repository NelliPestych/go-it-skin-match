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
 *   6. On Continue, push the 3 captured Files into FlowProvider and
 *      navigate to the quiz; AnalyzingPage dispatches the multi-image
 *      upload from there.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import CameraStatusPanel from "../components/camera/CameraStatusPanel";
import CaptureProgress from "../components/camera/CaptureProgress";
import CountdownOverlay from "../components/camera/CountdownOverlay";
import FaceOvalOverlay from "../components/camera/FaceOvalOverlay";
import GuidanceText from "../components/camera/GuidanceText";
import PoseArrow from "../components/camera/PoseArrow";
import IconButton from "../components/IconButton";
import PillButton from "../components/PillButton";
import { useFaceMesh } from "../hooks/useFaceMesh";
import { useLightingValidation } from "../hooks/useLightingValidation";
import { useSmartCaptureFlow } from "../hooks/useSmartCaptureFlow";
import { useWebcam } from "../hooks/useWebcam";
import { evaluateGates, evaluateGuidance } from "../lib/cameraGuidance";
import { useFlow } from "../state/flow";
import type { CaptureStep } from "../types/camera";

const POSE_HINT: Record<CaptureStep, string> = {
  front: "Look at the screen",
  left: "Turn your face left",
  right: "Turn your face right",
};

export default function SmartCameraPage() {
  const navigate = useNavigate();
  const flow = useFlow();
  const { status: camStatus, videoRef, restart } = useWebcam();

  // Surface the live <video> to face / lighting / capture hooks.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const composedRef = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl(el);
  };

  const cameraReady = camStatus.kind === "ready";

  // Re-attach the live MediaStream whenever the <video> element
  // (re-)mounts. Required because `Take photos again` flips
  // session.complete, which unmounts the active-capture branch and
  // its <video>; on re-mount the new element has no `srcObject`
  // and would otherwise show a black frame indefinitely. useWebcam's
  // own attach effect doesn't fire here because `camStatus` hasn't
  // changed — only the DOM node has.
  useEffect(() => {
    if (videoEl && camStatus.kind === "ready") {
      videoEl.srcObject = camStatus.stream;
    }
  }, [videoEl, camStatus]);

  const face = useFaceMesh(videoEl, cameraReady);
  const lighting = useLightingValidation(videoEl, cameraReady);

  // The capture flow needs `passes` (computed from face + lighting +
  // pose), but `pose` is owned BY the flow — so we can't compute
  // `passes` before calling the hook on the same render.  We break
  // the cycle by feeding the hook a piece of state that lags one
  // render behind: render N's `evaluateGuidance` runs AFTER the hook
  // call, and if its result differs from the current value we
  // `setPasses(...)`, which schedules render N+1 where the hook sees
  // the fresh value.
  //
  // We must use state (not a ref) here: a ref write never schedules
  // a re-render, so on a perfectly still face with stable lighting
  // (no other state changes upstream) the hook would read `false`
  // forever and the countdown would never start.
  const [passes, setPasses] = useState(false);
  const captureEnabled = cameraReady && !face.error;
  const session = useSmartCaptureFlow(videoEl, passes, captureEnabled);

  const gates = evaluateGates(face, lighting, session.pose);
  const report = evaluateGuidance(face, lighting, session.pose);
  useEffect(() => {
    if (passes !== report.passes) setPasses(report.passes);
  }, [report.passes, passes]);

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

  // Defer the review screen by ~900 ms after the third capture so the
  // user actually SEES the third pose-dot flip from "active" to
  // green-checked.  Without this delay we'd unmount the active-capture
  // branch the same render `session.complete` flips true and skip
  // the visible state change altogether.
  const [showReview, setShowReview] = useState(false);
  useEffect(() => {
    if (!session.complete) {
      setShowReview(false);
      return;
    }
    const t = window.setTimeout(() => setShowReview(true), 900);
    return () => window.clearTimeout(t);
  }, [session.complete]);

  // ── Final review (light cream theme, à la LRP) ─────────────────
  if (showReview) {
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
          {/* Hand the captured frames to the shared FlowProvider and
              kick off the regular quiz → analyzing → results pipeline.
              `setImageFile` (= front) intentionally clears any stale
              `additionalImages` from a previous session, so we set
              the side photos AFTER the front to keep them in sync. */}
          <PillButton
            onClick={() => {
              if (!session.images.front) return;
              flow.setImageFile(session.images.front);
              flow.setAdditionalImages({
                left: session.images.left ?? null,
                right: session.images.right ?? null,
              });
              navigate("/quiz/skin-type");
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
            videoEl={videoEl}
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
            {/* Directional chevron next to the oval — only while the
                pose gate hasn't passed yet, never on `front`. Sits
                level with the centre headline so the eye reads them
                as one unit. */}
            <PoseArrow pose={session.pose} visible={!gates.poseOk} />
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
