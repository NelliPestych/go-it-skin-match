/**
 * Face landmarks via MediaPipe FaceLandmarker (478 landmarks).
 *
 * The hook runs the model on each video frame via `requestAnimation
 * Frame` and exposes a normalized result that can be rendered on a
 * canvas overlay (commit #6) or fed into the guidance evaluator
 * (commit #7).
 *
 * Why a heuristic yaw (not the 3-D transformation matrix)?
 * The full pose matrix requires `outputFacialTransformationMatrixes:
 * true`, which doubles model latency on weaker devices. For the MVP
 * we use a simple landmark ratio that is good enough to bucket a
 * head into front / left / right.
 *
 * The hook is defensive — if MediaPipe fails to load (network, CSP,
 * unsupported browser), `error` is populated and `hasFace` stays
 * `false` so the camera preview keeps working without detection.
 */
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";

import type { FaceBBox, FaceLandmark, FaceMeshResult } from "../types/camera";

const WASM_PATH =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Canonical Face Mesh landmark indices (MediaPipe numbering).
//   1   — nose tip
//  33   — right-eye outer corner (face's right = camera's left)
// 263   — left-eye  outer corner (face's left  = camera's right)
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

/**
 * Approximate head yaw in degrees from three landmarks.
 *
 * yawNorm = (nose.x - eyeMidX) / eyeDist
 *   ~0  → looking at camera
 *   >0  → user has rotated their head TO USER-LEFT (perceived as
 *         "turned right" in the mirrored selfie view)
 *   <0  → opposite
 *
 * The 60 multiplier is a rough conversion to degrees calibrated
 * empirically (yawNorm = 0.25 ≈ 15° turn, plenty for our buckets).
 */
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

export function useFaceMesh(
  videoEl: HTMLVideoElement | null,
  active: boolean,
): FaceMeshResult {
  const [result, setResult] = useState<FaceMeshResult>(INITIAL);
  const detectorRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  // Throttle setState — we only want React re-renders when summary
  // fields change, not 60×/s as landmark noise jitters.
  const lastSnapshotRef = useRef<string>("");

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
          // Skip the 4×4 pose matrix; we use a landmark heuristic instead.
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
      // Skip frames before the video has dimensions.
      if (videoEl.readyState < 2 || videoEl.videoWidth === 0) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      try {
        const ts = performance.now();
        const out = detector.detectForVideo(videoEl, ts);
        const faceLandmarks = out.faceLandmarks?.[0];

        if (!faceLandmarks || faceLandmarks.length === 0) {
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
        // One bad frame shouldn't kill the loop — log once and continue.
        // eslint-disable-next-line no-console
        console.warn("face mesh error:", err);
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    function publish(next: FaceMeshResult) {
      // Coalesce identical updates (rounded to 1pp) to avoid React
      // re-renders 60×/s. Mesh-canvas consumers that need fresher
      // landmarks should wire their own RAF off the video element
      // — this hook is the source of truth for state, not DOM paint.
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

  return result;
}
