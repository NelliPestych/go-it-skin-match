/**
 * WebRTC camera lifecycle hook.
 *
 * Wraps `navigator.mediaDevices.getUserMedia` and exposes a tight,
 * stateful API:
 *   - `status`   — discriminated union (idle | starting | ready | error)
 *   - `videoRef` — attach to a `<video>` element to render the preview
 *   - `restart()` — re-acquire the stream (e.g. after the user grants
 *     permission and taps "Try again")
 *
 * The hook releases all underlying media tracks on unmount and on
 * every re-acquisition so leaving the page (or re-mounting under
 * React StrictMode) does not leave the camera light on.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { CameraStatus } from "../types/camera";

export interface UseWebcamOptions {
  facingMode?: "user" | "environment";
  width?: number;
  height?: number;
}

const DEFAULTS: Required<UseWebcamOptions> = {
  facingMode: "user",
  width: 720,
  height: 960,
};

function friendlyError(err: unknown): { message: string; recoverable: boolean } {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "SecurityError":
        return {
          message:
            "Camera access was blocked. Allow it in your browser settings and retry.",
          recoverable: true,
        };
      case "NotFoundError":
      case "DevicesNotFoundError":
        return { message: "No camera found on this device.", recoverable: false };
      case "NotReadableError":
      case "TrackStartError":
        return {
          message: "Camera is in use by another application.",
          recoverable: true,
        };
      case "OverconstrainedError":
        return {
          message: "Camera does not support the requested resolution.",
          recoverable: true,
        };
      default:
        return { message: err.message || "Failed to start camera.", recoverable: true };
    }
  }
  if (err instanceof Error) return { message: err.message, recoverable: true };
  return { message: "Failed to start camera.", recoverable: true };
}

export function useWebcam(options: UseWebcamOptions = {}) {
  const { facingMode, width, height } = { ...DEFAULTS, ...options };
  const [status, setStatus] = useState<CameraStatus>({ kind: "idle" });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [restartTick, setRestartTick] = useState(0);

  const restart = useCallback(() => setRestartTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus({
        kind: "error",
        message: "Camera API is not available in this browser.",
        recoverable: false,
      });
      return;
    }

    setStatus({ kind: "starting" });

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode,
          width: { ideal: width },
          height: { ideal: height },
        },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setStatus({ kind: "ready", stream });
      })
      .catch((err) => {
        if (cancelled) return;
        const { message, recoverable } = friendlyError(err);
        setStatus({ kind: "error", message, recoverable });
      });

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [facingMode, width, height, restartTick]);

  // Attach the live stream to the <video> element whenever both become
  // ready. Re-runs cover the StrictMode double-mount case where
  // srcObject may have been written to a stale element.
  useEffect(() => {
    if (status.kind === "ready" && videoRef.current) {
      videoRef.current.srcObject = status.stream;
    }
  }, [status]);

  return { status, videoRef, restart };
}
