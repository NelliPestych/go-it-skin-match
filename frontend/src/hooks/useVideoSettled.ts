import { useEffect, useState } from "react";

/**
 * True once the camera preview has stabilised. iOS ramps the capture format
 * after getUserMedia (preview jumps from zoomed-in to the final FOV), so we
 * hold the reveal until the resolution holds steady — masking the jump.
 */
const STABLE_MS = 600; // resolution must hold steady this long after playback
const MAX_WAIT_MS = 2500; // hard cap so we never get stuck hiding the preview

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

    const capTimer = setTimeout(finish, MAX_WAIT_MS);

    // Each format ramp (resize) restarts the steady window.
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

    // Already playing on attach (e.g. re-mount on retake).
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
