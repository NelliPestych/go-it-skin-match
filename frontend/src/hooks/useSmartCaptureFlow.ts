/**
 * Smart Capture state machine: scanning → stabilizing → counting → flash → done.
 * Multi-pose: front → left → right. Two effects (timer / capture) keep cleanup clean.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CaptureFlowStatus,
  CaptureImages,
  CaptureStep,
} from "../types/camera";

const WARMUP_MS = 800;
const COUNTDOWN_MS = 1500;
const FLASH_MS = 120;

const POSES: readonly CaptureStep[] = ["front", "left", "right"] as const;

export interface SmartCaptureFlowResult {
  pose: CaptureStep;
  /** 1-based index for the UI ("Step 2 of 3"). */
  stepIndex: number;
  totalSteps: number;
  status: CaptureFlowStatus;
  /** 3 / 2 / 1 while counting; 0 otherwise. */
  countdownDigit: number;
  /** 0..1 progress through the warmup phase. */
  warmupProgress: number;
  /** 0..1 progress through the countdown phase. */
  countdownProgress: number;
  images: CaptureImages;
  /** True once all three poses are captured. */
  complete: boolean;
  reset: () => void;
}

async function grabFrame(video: HTMLVideoElement | null): Promise<File | null> {
  if (!video) return null;
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) resolve(null);
        else
          resolve(
            new File([blob], `skinmatch-${Date.now()}.jpg`, { type: "image/jpeg" }),
          );
      },
      "image/jpeg",
      0.92,
    );
  });
}

export function useSmartCaptureFlow(
  videoEl: HTMLVideoElement | null,
  passes: boolean,
  enabled = true,
): SmartCaptureFlowResult {
  const [pose, setPose] = useState<CaptureStep>("front");
  const [status, setStatus] = useState<CaptureFlowStatus>("scanning");
  const [images, setImages] = useState<CaptureImages>({});
  const [warmupProgress, setWarmupProgress] = useState(0);
  const [countdownProgress, setCountdownProgress] = useState(0);
  const [armed, setArmed] = useState(true);

  // Refs so the deferred capture writes to the current slot across re-renders.
  const videoRef = useRef<HTMLVideoElement | null>(videoEl);
  videoRef.current = videoEl;
  const poseRef = useRef(pose);
  poseRef.current = pose;

  const reset = useCallback(() => {
    setPose("front");
    setImages({});
    setStatus("scanning");
    setWarmupProgress(0);
    setCountdownProgress(0);
    setArmed(true);
  }, []);

  // Effect A: warmup → countdown timer.
  useEffect(() => {
    if (!enabled || !armed) return;
    if (!passes) {
      // Drop to scanning but never overwrite committed states (flash/done).
      setStatus((prev) => (prev === "flash" || prev === "done" ? prev : "scanning"));
      setWarmupProgress(0);
      setCountdownProgress(0);
      return;
    }

    setStatus("stabilizing");
    const warmupStart = performance.now();
    let phase: "warmup" | "countdown" = "warmup";
    let countdownStart = 0;
    let raf: number | null = null;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const now = performance.now();

      if (phase === "warmup") {
        const p = Math.min(1, (now - warmupStart) / WARMUP_MS);
        setWarmupProgress(p);
        if (p < 1) {
          raf = requestAnimationFrame(tick);
          return;
        }
        phase = "countdown";
        countdownStart = now;
        setStatus("counting");
        setWarmupProgress(1);
        raf = requestAnimationFrame(tick);
        return;
      }

      const p = Math.min(1, (now - countdownStart) / COUNTDOWN_MS);
      setCountdownProgress(p);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }

      // Disarm + hand off to capture effect; grab happens there.
      setArmed(false);
      setStatus("flash");
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [enabled, armed, passes]);

  // Effect B: flash → capture → advance.
  useEffect(() => {
    if (status !== "flash") return;
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      grabFrame(videoRef.current).then((file) => {
        if (cancelled) return;
        if (file) {
          const currentPose = poseRef.current;
          setImages((prev) => ({ ...prev, [currentPose]: file }));
          const idx = POSES.indexOf(currentPose);
          const isLast = idx >= POSES.length - 1;
          if (isLast) {
            // Leave armed=false so the timer can't refire if passes stays true.
            setStatus("done");
          } else {
            setPose(POSES[idx + 1]);
            setStatus("scanning");
            setWarmupProgress(0);
            setCountdownProgress(0);
            setArmed(true);
          }
        } else {
          // Couldn't decode the frame — fall back to scanning.
          setStatus("scanning");
          setWarmupProgress(0);
          setCountdownProgress(0);
          setArmed(true);
        }
      });
    }, FLASH_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [status]);

  const complete = !!(images.front && images.left && images.right);
  const stepIndex = POSES.indexOf(pose) + 1;
  // Clamp at 1 so the last frame reads "1" not "0".
  const countdownDigit =
    status === "counting"
      ? Math.max(1, Math.ceil((1 - countdownProgress) * 3))
      : 0;

  return {
    pose,
    stepIndex,
    totalSteps: POSES.length,
    status,
    countdownDigit,
    warmupProgress,
    countdownProgress,
    images,
    complete,
    reset,
  };
}
