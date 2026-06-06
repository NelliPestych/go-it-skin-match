/** Type contracts shared by Smart Camera hooks, overlays, and the capture flow. */

/** Discriminated union for WebRTC lifecycle — drives distinct UI per state. */
export type CameraStatus =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "ready"; stream: MediaStream }
  | { kind: "error"; message: string; recoverable: boolean };

export type CaptureStep = "front" | "left" | "right";

export interface CaptureImages {
  front?: File;
  left?: File;
  right?: File;
}

/**
 * useSmartCaptureFlow lifecycle:
 *   scanning → gates failing; stabilizing → gates green, 800 ms warm-up;
 *   counting → 3-2-1; flash → white frame before grab; done → File captured.
 */
export type CaptureFlowStatus =
  | "scanning"
  | "stabilizing"
  | "counting"
  | "flash"
  | "done";

export type LightingStatus = "unknown" | "too_dark" | "ok" | "too_bright";

export interface LightingResult {
  /** Mean Rec.709 luminance, normalised 0..1. */
  brightness: number;
  status: LightingStatus;
}

/** Single face landmark in normalised 0..1 source-frame coords. */
export interface FaceLandmark {
  x: number;
  y: number;
  z?: number;
}

/** Top-left + dimensions, all 0..1. */
export interface FaceBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceMeshResult {
  ready: boolean;
  hasFace: boolean;
  landmarks: FaceLandmark[];
  bbox: FaceBBox | null;
  faceCenter: { x: number; y: number } | null;
  /** Normalised face width 0..1. */
  faceSize: number;
  /** Yaw in degrees: negative = head turned to user-right (un-mirrored frame). */
  yawDeg: number;
  error: string | null;
}

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

export interface GuidanceReport {
  status: GuidanceStatus;
  message: string;
  /** True only when every gate passes — used by the capture flow. */
  passes: boolean;
  /** Composite quality 0..1. */
  quality: number;
}

/** Per-gate booleans for the top status panel; each chip shows its own state. */
export interface GateChecks {
  lightingOk: boolean;
  positionOk: boolean;
  poseOk: boolean;
}
