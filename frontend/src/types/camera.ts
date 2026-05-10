/**
 * Type contracts for the Smart Camera feature.
 *
 * Defining all public types up-front lets each subsequent commit add a
 * concrete hook or component without re-shaping the surface of others
 * — `useWebcam`, `useFaceMesh`, `useLightingValidation`, the canvas
 * overlay, and the capture flow all communicate through these types.
 *
 * Nothing in this file is runtime code; it's purely a stable contract
 * that other files import from.
 */

// ─── Camera lifecycle ──────────────────────────────────────────────

/**
 * Discriminated union for the WebRTC camera lifecycle. The shape is
 * deliberately exhaustive so the page can render distinct UI for each
 * state without re-deriving from booleans.
 */
export type CameraStatus =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "ready"; stream: MediaStream }
  | { kind: "error"; message: string; recoverable: boolean };

// ─── Multi-shot session ────────────────────────────────────────────

/** A pose in the 3-shot Smart Camera session. */
export type CaptureStep = "front" | "left" | "right";

/** Files captured per pose. Optional because the user fills them in order. */
export interface CaptureImages {
  front?: File;
  left?: File;
  right?: File;
}

/**
 * Lifecycle of `useSmartCaptureFlow`:
 *   scanning     — at least one gate is failing; nothing pending.
 *   stabilizing  — gates green, holding ~800 ms warm-up before countdown.
 *   counting     — countdown 3 → 2 → 1 active.
 *   flash        — brief white frame before grabbing the canvas.
 *   done         — current pose's File has been captured.
 */
export type CaptureFlowStatus =
  | "scanning"
  | "stabilizing"
  | "counting"
  | "flash"
  | "done";

// ─── Lighting validation ───────────────────────────────────────────

export type LightingStatus = "unknown" | "too_dark" | "ok" | "too_bright";

export interface LightingResult {
  /** Mean Rec.709 luminance, normalised to 0..1. */
  brightness: number;
  status: LightingStatus;
}

// ─── Face geometry ─────────────────────────────────────────────────

/** Single face landmark in normalised 0..1 source-frame coords. */
export interface FaceLandmark {
  x: number;
  y: number;
  z?: number;
}

/** Bounding box for a detected face — top-left + dimensions, all 0..1. */
export interface FaceBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Face mesh snapshot returned by `useFaceMesh`. Filled in once
 * MediaPipe FaceLandmarker is wired (commit #4); earlier commits use
 * only the camera stream and may receive `ready: false` indefinitely.
 */
export interface FaceMeshResult {
  ready: boolean;
  hasFace: boolean;
  landmarks: FaceLandmark[];
  bbox: FaceBBox | null;
  faceCenter: { x: number; y: number } | null;
  /** Normalised face width 0..1 (proxy for "how big is the face"). */
  faceSize: number;
  /**
   * Approximate yaw in **degrees** (negative = head turned to user-right
   * in the un-mirrored frame; positive = user-left).  Computed from a
   * simple landmark heuristic; exact 3-D pose is out of scope for the
   * MVP.
   */
  yawDeg: number;
  error: string | null;
}

// ─── Guidance ──────────────────────────────────────────────────────

export type GuidanceStatus =
  | "no_face"
  | "too_small"
  | "too_big"
  | "off_center"
  | "turn_left"
  | "turn_right"
  | "too_dark"
  | "too_bright"
  | "aligned";

/** Computed by the pure guidance evaluator; drives `GuidanceText`. */
export interface GuidanceReport {
  status: GuidanceStatus;
  message: string;
  /** True only when *every* gate passes — used by the capture flow. */
  passes: boolean;
  /** Composite quality 0..1 (closer to 1 = closer to ideal). */
  quality: number;
}

/**
 * Independent per-gate booleans for the top status panel. Each chip
 * derives its colour from one boolean; the user therefore always sees
 * the failing gate instead of a single combined message.
 */
export interface GateChecks {
  lightingOk: boolean;
  positionOk: boolean;
  poseOk: boolean;
}
