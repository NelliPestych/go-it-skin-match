/**
 * Pure guidance evaluators for the Smart Camera flow.
 *
 * Two outputs from the same inputs:
 *
 *   evaluateGates(face, lighting, pose) → { lightingOk,
 *                                           positionOk,
 *                                           poseOk }
 *     Independent per-gate booleans for the top status panel.
 *     Each chip turns green when its own gate passes; the user
 *     therefore always sees the failing gate, not a single rolled-up
 *     message.
 *
 *   evaluateGuidance(face, lighting, pose) → GuidanceReport
 *     The single dominant message ("Move closer", "Too dark",
 *     "Turn your face left", …). Lighting takes priority — exposure
 *     problems block downstream skin analysis. Once exposure is
 *     ok, position checks run, then the pose-specific yaw band.
 *
 * Yaw sign convention (un-mirrored coords from MediaPipe):
 *   yawDeg > 0  → user has turned head TO USER-LEFT
 *   yawDeg < 0  → user has turned head TO USER-RIGHT
 * In the mirrored selfie view that's the opposite, but the chip
 * labels and prompts are written from the user's POV.
 */
import type {
  CaptureStep,
  FaceMeshResult,
  GateChecks,
  GuidanceReport,
  LightingResult,
} from "../types/camera";

// Tunable thresholds. Calibrated against typical phone front-camera
// crops; see commit #4 for how yawDeg is computed and why ±10° is
// the front-band default.
export const SIZE_MIN = 0.35;
export const SIZE_MAX = 0.85;
export const SIZE_IDEAL = 0.6;
export const CENTER_TOL = 0.16;
/** ± degrees of yaw considered "looking straight". */
export const YAW_FRONT_TOL = 10;
/** Lower bound of the side-pose yaw band. */
export const YAW_BAND_LOW = 12;
/** Upper bound of the side-pose yaw band. */
export const YAW_BAND_HIGH = 45;

export function evaluateGates(
  face: FaceMeshResult,
  lighting: LightingResult,
  pose: CaptureStep,
): GateChecks {
  return {
    lightingOk: lighting.status === "ok" || lighting.status === "unknown",
    positionOk: isPositionOk(face),
    poseOk: isPoseOk(face, pose),
  };
}

function isPositionOk(face: FaceMeshResult): boolean {
  if (!face.hasFace || !face.faceCenter) return false;
  if (face.faceSize < SIZE_MIN || face.faceSize > SIZE_MAX) return false;
  const dx = face.faceCenter.x - 0.5;
  const dy = face.faceCenter.y - 0.5;
  return Math.hypot(dx, dy) <= CENTER_TOL;
}

function isPoseOk(face: FaceMeshResult, pose: CaptureStep): boolean {
  if (!face.hasFace) return false;
  const yaw = face.yawDeg;
  if (pose === "front") return Math.abs(yaw) <= YAW_FRONT_TOL;
  if (pose === "left") return yaw >= YAW_BAND_LOW && yaw <= YAW_BAND_HIGH;
  return yaw <= -YAW_BAND_LOW && yaw >= -YAW_BAND_HIGH;
}

export function evaluateGuidance(
  face: FaceMeshResult,
  lighting: LightingResult,
  pose: CaptureStep,
): GuidanceReport {
  // 1. Lighting — wrong exposure ruins skin analysis; fix first.
  if (lighting.status === "too_dark") {
    return {
      status: "too_dark",
      message: "Too dark — add light",
      passes: false,
      quality: 0.2,
    };
  }
  if (lighting.status === "too_bright") {
    return {
      status: "too_bright",
      message: "Too bright — soften the light",
      passes: false,
      quality: 0.2,
    };
  }

  // 2. Face presence + framing.
  if (!face.hasFace) {
    return {
      status: "no_face",
      message: "Center your face",
      passes: false,
      quality: 0,
    };
  }
  if (face.faceSize < SIZE_MIN) {
    return { status: "too_small", message: "Move closer", passes: false, quality: 0.3 };
  }
  if (face.faceSize > SIZE_MAX) {
    return { status: "too_big", message: "Move farther", passes: false, quality: 0.4 };
  }
  if (face.faceCenter) {
    const off = Math.hypot(face.faceCenter.x - 0.5, face.faceCenter.y - 0.5);
    if (off > CENTER_TOL) {
      return {
        status: "off_center",
        message: "Center your face",
        passes: false,
        quality: 0.5,
      };
    }
  }

  // 3. Pose-aware yaw check.
  const yaw = face.yawDeg;
  if (pose === "front") {
    if (yaw > YAW_FRONT_TOL) {
      return {
        status: "turn_right",
        message: "Look at the screen",
        passes: false,
        quality: 0.6,
      };
    }
    if (yaw < -YAW_FRONT_TOL) {
      return {
        status: "turn_left",
        message: "Look at the screen",
        passes: false,
        quality: 0.6,
      };
    }
  } else if (pose === "left") {
    if (yaw < YAW_BAND_LOW) {
      return {
        status: "turn_left",
        message: "Turn your face left",
        passes: false,
        quality: 0.6,
      };
    }
    if (yaw > YAW_BAND_HIGH) {
      return {
        status: "turn_right",
        message: "A bit less to the left",
        passes: false,
        quality: 0.6,
      };
    }
  } else {
    // pose === "right"
    if (yaw > -YAW_BAND_LOW) {
      return {
        status: "turn_right",
        message: "Turn your face right",
        passes: false,
        quality: 0.6,
      };
    }
    if (yaw < -YAW_BAND_HIGH) {
      return {
        status: "turn_left",
        message: "A bit less to the right",
        passes: false,
        quality: 0.6,
      };
    }
  }

  // 4. All checks pass — composite quality from size + centring.
  const sizeQuality = 1 - Math.abs(face.faceSize - SIZE_IDEAL) / SIZE_IDEAL;
  const centerOff = face.faceCenter
    ? Math.hypot(face.faceCenter.x - 0.5, face.faceCenter.y - 0.5)
    : 0;
  const centerQuality = 1 - centerOff / CENTER_TOL;
  const quality = Math.max(0, Math.min(1, 0.5 * sizeQuality + 0.5 * centerQuality));

  return {
    status: "aligned",
    message: "Hold still",
    passes: true,
    quality,
  };
}
