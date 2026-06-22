import { useEffect, useState } from "react";

/**
 * Reports `true` once the camera preview has stabilised.
 *
 * iOS (notably iPhone Pro models) ramps the capture format shortly after
 * `getUserMedia` resolves: the preview visibly jumps from a zoomed-in /
 * still-focusing frame to the final field of view. We watch the `<video>`
 * for `playing` + dimension `resize` events and only report "settled" once
 * the resolution has held steady for STABLE_MS, with a MAX_WAIT_MS hard
 * fallback so we never get stuck hiding the preview.
 *
 * Callers gate the visible reveal (and capture) on this, so the user sees a
 * spinner during the ramp and then a clean, correctly-framed preview — never
 * the zoom jump, and never a captured frame from the un-settled state.
 */
const STABLE_MS = 600; // dimensions must hold steady this long after playback
const MAX_WAIT_MS = 2500; // absolute cap — reveal even if events never quiesce

export function useVideoSettled(
  video: HTMLVideoElement | null,
  active: boolean,
): boolean {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!active || !video) {
      setSettled(false);
      return;
    }

    let playingSeen = false;
    let done = false;
    let stableTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (done) return;
      done = true;
      if (stableTimer) clearTimeout(stableTimer);
      clearTimeout(capTimer);
      setSettled(true);
    };

    // Absolute fallback — reveal even if `playing`/`resize` never quiesce.
    const capTimer = setTimeout(finish, MAX_WAIT_MS);

    // Restart the "steady" window; each format ramp (resize) pushes it out.
    const armStable = () => {
      if (done || !playingSeen || video.videoWidth === 0) return;
      if (stableTimer) clearTimeout(stableTimer);
      stableTimer = setTimeout(finish, STABLE_MS);
    };

    const onPlaying = () => {
      playingSeen = true;
      armStable();
    };
    const onResize = () => armStable();

    video.addEventListener("playing", onPlaying);
    video.addEventListener("resize", onResize);
    video.addEventListener("loadedmetadata", onResize);

    // Already playing by the time we attach (e.g. re-mount on retake).
    if (!video.paused && video.videoWidth > 0) {
      playingSeen = true;
      armStable();
    }

    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("resize", onResize);
      video.removeEventListener("loadedmetadata", onResize);
      if (stableTimer) clearTimeout(stableTimer);
      clearTimeout(capTimer);
    };
  }, [video, active]);

  return settled;
}
