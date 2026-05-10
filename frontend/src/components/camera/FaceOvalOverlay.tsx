/**
 * Canvas overlay drawn on top of the live <video>.
 *
 * Renders three layers per frame:
 *   1. A vignette mask: dim outside the framing oval, transparent
 *      inside — so the user instinctively centres their face.
 *   2. A subtle face mesh from MediaPipe FACE_LANDMARKS_TESSELATION
 *      (~1900 short edges; thin, semi-transparent).
 *   3. An animated horizontal scanning line, clipped to the oval.
 *
 * Tied together by an oval ring that switches between three states:
 *   - "scanning"  white dashed (looking for a face)
 *   - "pass"      green        (all gates green; capture imminent)
 *   - "fail"      red          (at least one gate failing)
 *
 * The drawing loop runs in its own `requestAnimationFrame` and
 * reads `landmarksRef.current` every frame so the mesh tracks the
 * face at native FPS even though the parent's React state for
 * `useFaceMesh` is throttled.
 *
 * Usage notes for commit #10:
 * - Place inside the same parent that mirrors the <video> via
 *   `transform: scaleX(-1)` so mesh coordinates align visually with
 *   the selfie preview.
 * - `pointer-events: none` so the overlay never steals taps.
 */
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { useEffect, useRef } from "react";

import type { FaceLandmark } from "../../types/camera";

export type OverlayState = "scanning" | "pass" | "fail";

interface Props {
  /** Always-fresh ref from `useFaceMesh`. Empty array hides the mesh. */
  landmarksRef: React.MutableRefObject<FaceLandmark[]>;
  hasFace: boolean;
  state: OverlayState;
}

const RING_COLOR: Record<OverlayState, string> = {
  scanning: "rgba(255, 255, 255, 0.85)",
  pass: "#10b981",
  fail: "#ef4444",
};

const MESH_COLOR: Record<OverlayState, string> = {
  scanning: "rgba(255, 255, 255, 0.5)",
  pass: "rgba(16, 185, 129, 0.65)",
  fail: "rgba(239, 68, 68, 0.65)",
};

// Static connection list owned by the FaceLandmarker class — pulling
// the reference once at module level keeps the per-frame draw cheap.
const TESSELATION = FaceLandmarker.FACE_LANDMARKS_TESSELATION;

export default function FaceOvalOverlay({ landmarksRef, hasFace, state }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Mirror live props into refs so the long-running RAF loop never
  // needs to be torn down — only canvas resize / unmount triggers it.
  const hasFaceRef = useRef(hasFace);
  const stateRef = useRef(state);
  hasFaceRef.current = hasFace;
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    let cancelled = false;
    let lastResizeCheck = 0;

    function resizeIfNeeded() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const targetW = Math.max(1, Math.floor(cssW * dpr));
      const targetH = Math.max(1, Math.floor(cssH * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    }

    function draw() {
      if (cancelled || !canvas) return;
      const now = performance.now();
      if (now - lastResizeCheck > 500) {
        resizeIfNeeded();
        lastResizeCheck = now;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        raf = requestAnimationFrame(draw);
        return;
      }

      const w = canvas.width;
      const h = canvas.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const ringS = stateRef.current;

      ctx.clearRect(0, 0, w, h);

      // Oval geometry (fits a typical phone front-cam crop).
      const cx = w / 2;
      const cy = h * 0.48;
      const rx = Math.min(w * 0.4, h * 0.3);
      const ry = rx * 1.32;

      // ── Vignette: dim outside the oval ──────────────────────────
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      // Counter-clockwise sub-path → "evenodd" leaves the ellipse hollow.
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI, true);
      ctx.fill("evenodd");
      ctx.restore();

      // ── Face mesh inside the oval ───────────────────────────────
      if (hasFaceRef.current) {
        const lms = landmarksRef.current;
        if (lms.length > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
          ctx.clip();

          ctx.strokeStyle = MESH_COLOR[ringS];
          ctx.lineWidth = 0.5 * dpr;
          ctx.beginPath();
          for (let i = 0; i < TESSELATION.length; i++) {
            const conn = TESSELATION[i];
            const a = lms[conn.start];
            const b = lms[conn.end];
            if (!a || !b) continue;
            ctx.moveTo(a.x * w, a.y * h);
            ctx.lineTo(b.x * w, b.y * h);
          }
          ctx.stroke();
          ctx.restore();
        }
      }

      // ── Scanning line, clipped to the oval ──────────────────────
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
      ctx.clip();

      const cycle = 2400; // ms; ~0.4 Hz oscillation
      const phase = ((now % cycle) / cycle) * 2 * Math.PI;
      const yOffset = Math.sin(phase) * ry * 0.7;
      const lineY = cy + yOffset;
      const ringColor = RING_COLOR[ringS];

      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 1.5 * dpr;
      ctx.shadowColor = ringColor;
      ctx.shadowBlur = 6 * dpr;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx - rx * 0.85, lineY);
      ctx.lineTo(cx + rx * 0.85, lineY);
      ctx.stroke();
      ctx.restore();

      // ── Oval ring on top ────────────────────────────────────────
      ctx.save();
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 2.5 * dpr;
      if (ringS === "scanning") {
        ctx.setLineDash([8 * dpr, 4 * dpr]);
      }
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();

      raf = requestAnimationFrame(draw);
    }

    resizeIfNeeded();
    raf = requestAnimationFrame(draw);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [landmarksRef]);

  return <canvas ref={canvasRef} className="sc-face-overlay" />;
}
