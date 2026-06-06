/**
 * Canvas overlay on the live <video>: vignette + mesh "wet-sand" wave + state-coloured oval ring.
 * Three-pass mesh draw (dim baseline / wet-trail gradient / leading-edge glow strip).
 * Owns its own RAF; reads landmarksRef every frame for native-FPS tracking.
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
  /** Used for videoWidth/Height to mirror object-fit:cover crop on mesh. */
  videoEl: HTMLVideoElement | null;
}

const RING_COLOR: Record<OverlayState, string> = {
  scanning: "rgba(255, 255, 255, 0.85)",
  pass: "#10b981",
  fail: "#ef4444",
};

// Alpha controlled per-pass via globalAlpha.
const MESH_COLOR: Record<OverlayState, string> = {
  scanning: "#ffffff",
  pass: "#10b981",
  fail: "#ef4444",
};

/** Pre-parsed RGB triples — the gradient builder needs them every
 *  frame and re-parsing the hex 60×/s is wasteful. */
const MESH_RGB: Record<OverlayState, [number, number, number]> = {
  scanning: [255, 255, 255],
  pass: [16, 185, 129],
  fail: [239, 68, 68],
};

// Static connection list owned by the FaceLandmarker class — pulling
// the reference once at module level keeps the per-frame draw cheap.
const TESSELATION = FaceLandmarker.FACE_LANDMARKS_TESSELATION;

export default function FaceOvalOverlay({
  landmarksRef,
  hasFace,
  state,
  videoEl,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Mirror live props into refs so the long-running RAF loop never
  // needs to be torn down — only canvas resize / unmount triggers it.
  const hasFaceRef = useRef(hasFace);
  const stateRef = useRef(state);
  const videoRef = useRef(videoEl);
  hasFaceRef.current = hasFace;
  stateRef.current = state;
  videoRef.current = videoEl;

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
      const rx = Math.min(w * 0.4, h * 0.3);
      const ry = rx * 1.32;
      // Push oval down on short stages so it clears the guidance text
      // at the top; cap from below so the ellipse stays in view on
      // very short stages (iPhone 5/SE).
      const headerGutter = 90;
      const footerGutter = 16;
      let cy = h * 0.48;
      const minCy = headerGutter + ry;
      const maxCy = h - footerGutter - ry;
      if (cy < minCy) cy = minCy;
      if (cy > maxCy) cy = maxCy;

      // ── Vignette: dim outside the oval ──────────────────────────
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      // Counter-clockwise sub-path → "evenodd" leaves the ellipse hollow.
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI, true);
      ctx.fill("evenodd");
      ctx.restore();

      // ── Face mesh with built-in scan band ───────────────────────
      // Two passes:
      //   Pass 1 — dim baseline: the whole mesh at low alpha so the
      //            user always sees the geometry locked onto their
      //            face.
      //   Pass 2 — bright band: same mesh re-stroked, but clipped to
      //            a horizontal band that oscillates top↔bottom.
      //            shadowBlur on this pass turns the band edges into
      //            a soft glow so the band reads as a wave of light.
      if (hasFaceRef.current) {
        const lms = landmarksRef.current;
        const video = videoRef.current;
        if (lms.length > 0 && video && video.videoWidth > 0 && video.videoHeight > 0) {
          // Cover-transform: same crop the browser applies to <video>.
          const srcW = video.videoWidth;
          const srcH = video.videoHeight;
          const scale = Math.max(w / srcW, h / srcH);
          const visibleW = w / scale;
          const visibleH = h / scale;
          const cropX = (srcW - visibleW) / 2;
          const cropY = (srcH - visibleH) / 2;

          // Build the mesh path once per frame and reuse it for both
          // passes — Path2D lets us stroke twice with different state.
          const meshPath = new Path2D();
          for (let i = 0; i < TESSELATION.length; i++) {
            const conn = TESSELATION[i];
            const a = lms[conn.start];
            const b = lms[conn.end];
            if (!a || !b) continue;
            const ax = (a.x * srcW - cropX) * scale;
            const ay = (a.y * srcH - cropY) * scale;
            const bx = (b.x * srcW - cropX) * scale;
            const by = (b.y * srcH - cropY) * scale;
            meshPath.moveTo(ax, ay);
            meshPath.lineTo(bx, by);
          }

          const meshColor = MESH_COLOR[ringS];
          const [mr, mg, mb] = MESH_RGB[ringS];

          // ── Rising-wave geometry ───────────────────────────────
          // Single bottom→top sweep per cycle. Two phases:
          //   rise (0..0.7) — leading edge climbs from below the
          //                    oval to above it, ease-in-out.
          //   fade (0.7..1) — leading edge stays at the top, the
          //                    whole wave dissolves to alpha 0.
          const cycle = 3500;
          const t = ((now % cycle) / cycle);
          const ovalTop = cy - ry;
          const ovalBottom = cy + ry;
          const startY = ovalBottom + ry * 0.12;
          const endY = ovalTop - ry * 0.12;

          let leadingY: number;
          let waveOpacity: number;
          if (t <= 0.7) {
            const p = t / 0.7;
            // easeInOutQuad
            const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
            leadingY = startY + (endY - startY) * eased;
            waveOpacity = 1;
          } else {
            const p = (t - 0.7) / 0.3;
            leadingY = endY;
            waveOpacity = 1 - p; // linear fade
          }

          ctx.save();
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
          ctx.clip();

          // Pass 1 — dim baseline mesh, always visible while a face
          // is detected so the geometry reads as locked-on.
          ctx.strokeStyle = meshColor;
          ctx.lineWidth = 0.5 * dpr;
          ctx.globalAlpha = 0.32;
          ctx.stroke(meshPath);

          // Pass 2 — wet trail: a vertical α-gradient that LIVES on
          // top of the leading edge instead of stretching back to a
          // fixed tail. The gradient peaks AT `leadingY` and decays
          // to 0 over `decay` pixels below it, so the bright zone
          // moves upward together with the wave. We additionally
          // clip to that exact band — without the clip, gradients
          // extend their endpoint colour to ±∞, which would re-paint
          // the entire un-swept area above `leadingY` at α 1 (the
          // exact "thinning" artefact the previous attempt produced
          // when read through the dim baseline).
          //
          // Net visual: as `leadingY` rises, every part of the mesh
          // briefly brightens (wave passes), then fades back to the
          // dim baseline (sand dries). Above the wave the mesh is
          // still untouched dim baseline.
          const decay = ry * 0.5;
          const trailBottomY = leadingY + decay;
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, leadingY, w, decay);
          ctx.clip();
          const grad = ctx.createLinearGradient(0, trailBottomY, 0, leadingY);
          const a = (alpha: number) => `rgba(${mr}, ${mg}, ${mb}, ${alpha * waveOpacity})`;
          // 0 = furthest behind the wave (dried back to baseline);
          // 1 = right at the leading edge (wettest, brightest).
          grad.addColorStop(0, a(0));
          grad.addColorStop(0.35, a(0.12));
          grad.addColorStop(0.7, a(0.45));
          grad.addColorStop(0.92, a(0.85));
          grad.addColorStop(1, a(1));

          ctx.strokeStyle = grad;
          ctx.lineWidth = 0.7 * dpr;
          ctx.globalAlpha = 1;
          ctx.shadowColor = meshColor;
          ctx.shadowBlur = 4 * dpr;
          ctx.stroke(meshPath);
          ctx.restore();

          // Pass 3 — bright "glowing strip" right at the leading
          // edge: a thin band clipped to ±4 % of ry around scanY,
          // re-stroked at full alpha with a heavier shadowBlur.
          // Skipped during the fade phase (waveOpacity → 0) and
          // when the leading edge is outside the oval.
          if (
            waveOpacity > 0.05 &&
            leadingY > ovalTop - ry * 0.05 &&
            leadingY < ovalBottom
          ) {
            const stripH = ry * 0.08;
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, leadingY - stripH / 2, w, stripH);
            ctx.clip();
            ctx.strokeStyle = meshColor;
            ctx.lineWidth = 1.0 * dpr;
            ctx.globalAlpha = waveOpacity;
            ctx.shadowColor = meshColor;
            ctx.shadowBlur = 14 * dpr;
            ctx.stroke(meshPath);
            ctx.restore();
          }

          ctx.restore();
        }
      }

      // ── Oval ring on top ────────────────────────────────────────
      const ringColor = RING_COLOR[ringS];
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
