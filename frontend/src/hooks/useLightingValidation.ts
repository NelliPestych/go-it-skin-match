/** 4 Hz mean Rec.709 luminance sampler; throttled re-renders, bucketed status. */
import { useEffect, useRef, useState } from "react";

import type { LightingResult, LightingStatus } from "../types/camera";

const SAMPLE_SIZE = 64;
const TICK_MS = 250;
const TOO_DARK = 0.3;
const TOO_BRIGHT = 0.82;

const INITIAL: LightingResult = { brightness: 0, status: "unknown" };

export function useLightingValidation(
  videoEl: HTMLVideoElement | null,
  active: boolean,
): LightingResult {
  const [result, setResult] = useState<LightingResult>(INITIAL);
  const lastRef = useRef<LightingResult>(INITIAL);

  useEffect(() => {
    if (!videoEl || !active) return;
    if (typeof document === "undefined") return;

    let cancelled = false;
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    // willReadFrequently picks a software bitmap (~10× faster getImageData).
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const tick = () => {
      if (cancelled) return;
      if (videoEl.readyState < 2 || videoEl.videoWidth === 0) return;

      try {
        ctx.drawImage(videoEl, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        let sum = 0;
        const pixels = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        }
        const brightness = sum / pixels / 255;
        const status: LightingStatus =
          brightness < TOO_DARK
            ? "too_dark"
            : brightness > TOO_BRIGHT
            ? "too_bright"
            : "ok";

        const last = lastRef.current;
        if (status !== last.status || Math.abs(brightness - last.brightness) > 0.02) {
          const next = { brightness, status };
          lastRef.current = next;
          setResult(next);
        }
      } catch {
        // Decoder can briefly throw on tab restore — keep ticking.
      }
    };

    const id = window.setInterval(tick, TICK_MS);
    // One immediate sample so the chip doesn't sit on "unknown" for 250 ms.
    tick();

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [videoEl, active]);

  return result;
}
