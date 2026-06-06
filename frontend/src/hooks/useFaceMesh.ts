/** MediaPipe FaceLandmarker @ RAF; landmark-ratio yaw (no full pose matrix). */
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";

import type { FaceBBox, FaceLandmark, FaceMeshResult } from "../types/camera";

const WASM_PATH =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// MediaPipe FaceMesh indices.
const NOSE_TIP = 1;
const RIGHT_EYE_OUTER = 33;
const LEFT_EYE_OUTER = 263;

const INITIAL: FaceMeshResult = {
  ready: false,
  hasFace: false,
  landmarks: [],
  bbox: null,
  faceCenter: null,
  faceSize: 0,
  yawDeg: 0,
  error: null,
};

/** Approximate yaw from nose + eye landmarks; >0 = user-left. 60 = empirical deg conv. */
function computeYawDeg(landmarks: FaceLandmark[]): number {
  if (landmarks.length <= LEFT_EYE_OUTER) return 0;
  const nose = landmarks[NOSE_TIP];
  const lEye = landmarks[LEFT_EYE_OUTER];
  const rEye = landmarks[RIGHT_EYE_OUTER];
  const eyeMidX = (lEye.x + rEye.x) / 2;
  const eyeDist = Math.abs(lEye.x - rEye.x);
  if (eyeDist < 1e-4) return 0;
  return ((nose.x - eyeMidX) / eyeDist) * 60;
}

/** Tight bbox around all landmarks. */
function computeBBox(landmarks: FaceLandmark[]): FaceBBox | null {
  if (landmarks.length === 0) return null;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** FaceMeshResult + always-fresh ref so the canvas overlay can read every frame. */
export interface UseFaceMeshReturn extends FaceMeshResult {
  landmarksRef: React.MutableRefObject<FaceLandmark[]>;
}

export function useFaceMesh(
  videoEl: HTMLVideoElement | null,
  active: boolean,
): UseFaceMeshReturn {
  const [result, setResult] = useState<FaceMeshResult>(INITIAL);
  const detectorRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  // Throttle setState — don't re-render React on every landmark jitter.
  const lastSnapshotRef = useRef<string>("");
  // Always-fresh landmarks for the canvas overlay.
  const landmarksRef = useRef<FaceLandmark[]>([]);

  useEffect(() => {
    if (!videoEl || !active) return;

    let cancelled = false;

    (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
        if (cancelled) return;
        const detector = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: false,
          // Skip 4×4 pose matrix; landmark-ratio yaw is sufficient.
          outputFacialTransformationMatrixes: false,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        if (cancelled) {
          detector.close();
          return;
        }
        detectorRef.current = detector;
        setResult((prev) => ({ ...prev, ready: true }));
        loop();
      } catch (err) {
        if (cancelled) return;
        setResult({
          ...INITIAL,
          error: err instanceof Error ? err.message : "Failed to load face landmarker",
        });
      }
    })();

    function loop() {
      if (cancelled) return;
      const detector = detectorRef.current;
      if (!detector || !videoEl) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      if (videoEl.readyState < 2 || videoEl.videoWidth === 0) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      try {
        const ts = performance.now();
        const out = detector.detectForVideo(videoEl, ts);
        const faceLandmarks = out.faceLandmarks?.[0];

        if (!faceLandmarks || faceLandmarks.length === 0) {
          // Clear ref BEFORE throttled state update so overlay clears even if React skips.
          landmarksRef.current = [];
          publish({
            ready: true,
            hasFace: false,
            landmarks: [],
            bbox: null,
            faceCenter: null,
            faceSize: 0,
            yawDeg: 0,
            error: null,
          });
        } else {
          const lms: FaceLandmark[] = faceLandmarks.map((p) => ({
            x: p.x,
            y: p.y,
            z: p.z,
          }));
          landmarksRef.current = lms;
          const bbox = computeBBox(lms);
          const yaw = computeYawDeg(lms);
          publish({
            ready: true,
            hasFace: true,
            landmarks: lms,
            bbox,
            faceCenter: bbox
              ? { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 }
              : null,
            faceSize: bbox?.width ?? 0,
            yawDeg: yaw,
            error: null,
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("face mesh error:", err);
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    function publish(next: FaceMeshResult) {
      // Coalesce updates (rounded to 1pp) so React doesn't re-render 60×/s.
      const key = [
        next.hasFace ? 1 : 0,
        Math.round((next.faceCenter?.x ?? 0) * 100),
        Math.round((next.faceCenter?.y ?? 0) * 100),
        Math.round(next.faceSize * 100),
        Math.round(next.yawDeg),
      ].join("/");
      if (key === lastSnapshotRef.current) return;
      lastSnapshotRef.current = key;
      setResult(next);
    }

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      detectorRef.current?.close();
      detectorRef.current = null;
    };
  }, [videoEl, active]);

  return { ...result, landmarksRef };
}
