/**
 * Smart Camera page — minimal WebRTC shell (commit #2).
 *
 * Goal of this commit: prove the camera path end-to-end on the route
 * `/smart-camera`. Renders the live preview, handles permission /
 * device errors gracefully, and offers a fallback to the existing
 * manual upload flow at `/capture`.
 *
 * Subsequent commits add face detection, lighting validation, status
 * panels, countdown, and the multi-pose session on top of this shell.
 */
import { useNavigate } from "react-router-dom";

import { useWebcam } from "../hooks/useWebcam";

export default function SmartCameraPage() {
  const navigate = useNavigate();
  const { status, videoRef, restart } = useWebcam();

  return (
    <div className="sc-screen">
      <header className="sc-header">
        <button
          className="sc-icon-btn"
          onClick={() => navigate("/capture")}
          aria-label="Back"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M9 2L4 7l5 5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      <div className="sc-stage">
        {/* The mirrored selfie preview. Hidden until the stream is
            ready so we don't flash a black <video> rectangle. */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="sc-video"
          data-visible={status.kind === "ready"}
        />

        {status.kind === "starting" && (
          <div className="sc-overlay">
            <div className="sc-spinner" />
            <p className="sc-overlay-text">Starting camera…</p>
          </div>
        )}

        {status.kind === "error" && (
          <div className="sc-overlay">
            <div className="sc-overlay-icon" aria-hidden="true">📷</div>
            <p className="sc-error-title">Camera unavailable</p>
            <p className="sc-error-body">{status.message}</p>
            {status.recoverable && (
              <button className="sc-retry" onClick={restart}>
                Try again
              </button>
            )}
          </div>
        )}
      </div>

      <footer className="sc-footer">
        <button
          className="sc-fallback"
          onClick={() => navigate("/capture")}
        >
          Upload photo instead
        </button>
      </footer>
    </div>
  );
}
