/**
 * Unit coverage for the pure guidance evaluators.  These functions
 * are the core of the Smart Camera UX — they decide which chip turns
 * green, which headline shows, and whether the capture flow is
 * allowed to start its countdown.  Any threshold regression here
 * would silently break capture for real users.
 */
import { describe, expect, it } from "vitest";

import type { FaceMeshResult, LightingResult } from "../types/camera";
import {
  YAW_BAND_HIGH,
  YAW_BAND_LOW,
  YAW_FRONT_TOL,
  evaluateGates,
  evaluateGuidance,
} from "./cameraGuidance";

const okLighting: LightingResult = { brightness: 0.55, status: "ok" };
const tooDark: LightingResult = { brightness: 0.1, status: "too_dark" };

function face(overrides: Partial<FaceMeshResult> = {}): FaceMeshResult {
  return {
    ready: true,
    hasFace: true,
    landmarks: [],
    bbox: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
    faceCenter: { x: 0.5, y: 0.5 },
    faceSize: 0.6,
    yawDeg: 0,
    error: null,
    ...overrides,
  };
}

describe("evaluateGates", () => {
  it("turns all three gates green on a centred, well-lit, front-facing face", () => {
    const gates = evaluateGates(face(), okLighting, "front");
    expect(gates).toEqual({ lightingOk: true, positionOk: true, poseOk: true });
  });

  it("fails the lighting gate when exposure is bad", () => {
    expect(evaluateGates(face(), tooDark, "front").lightingOk).toBe(false);
  });

  it("fails the position gate when the face is far from centre", () => {
    expect(
      evaluateGates(face({ faceCenter: { x: 0.9, y: 0.5 } }), okLighting, "front").positionOk,
    ).toBe(false);
  });

  it("fails the position gate when the face is too small", () => {
    expect(evaluateGates(face({ faceSize: 0.1 }), okLighting, "front").positionOk).toBe(
      false,
    );
  });

  it("accepts a left pose strictly inside the [YAW_BAND_LOW, YAW_BAND_HIGH] band", () => {
    expect(evaluateGates(face({ yawDeg: YAW_BAND_LOW + 5 }), okLighting, "left").poseOk).toBe(
      true,
    );
    expect(evaluateGates(face({ yawDeg: YAW_BAND_LOW - 1 }), okLighting, "left").poseOk).toBe(
      false,
    );
    expect(evaluateGates(face({ yawDeg: YAW_BAND_HIGH + 1 }), okLighting, "left").poseOk).toBe(
      false,
    );
  });

  it("accepts a right pose for the symmetric negative-yaw band", () => {
    expect(
      evaluateGates(face({ yawDeg: -(YAW_BAND_LOW + 5) }), okLighting, "right").poseOk,
    ).toBe(true);
    expect(
      evaluateGates(face({ yawDeg: -(YAW_BAND_LOW - 1) }), okLighting, "right").poseOk,
    ).toBe(false);
  });
});

describe("evaluateGuidance", () => {
  it("prioritises lighting over framing — exposure ruins skin analysis", () => {
    const report = evaluateGuidance(
      face({ faceSize: 0.1 /* would also fail framing */ }),
      tooDark,
      "front",
    );
    expect(report.status).toBe("too_dark");
    expect(report.passes).toBe(false);
  });

  it("returns aligned + passes=true when all gates are satisfied", () => {
    const report = evaluateGuidance(face(), okLighting, "front");
    expect(report.status).toBe("aligned");
    expect(report.passes).toBe(true);
    expect(report.quality).toBeGreaterThan(0);
  });

  it("tells the user to turn further when their yaw is below the band", () => {
    const report = evaluateGuidance(
      face({ yawDeg: YAW_BAND_LOW - 1 }),
      okLighting,
      "left",
    );
    expect(report.status).toBe("turn_left");
    expect(report.message.toLowerCase()).toContain("left");
  });

  it("uses 'A bit less to the left' refinement when the user overshoots", () => {
    const report = evaluateGuidance(
      face({ yawDeg: YAW_BAND_HIGH + 5 }),
      okLighting,
      "left",
    );
    expect(report.status).toBe("turn_right");
    expect(report.message.toLowerCase()).toContain("less");
  });

  it("respects YAW_FRONT_TOL on the front pose", () => {
    expect(evaluateGuidance(face({ yawDeg: YAW_FRONT_TOL - 0.1 }), okLighting, "front").passes).toBe(
      true,
    );
    expect(evaluateGuidance(face({ yawDeg: YAW_FRONT_TOL + 1 }), okLighting, "front").passes).toBe(
      false,
    );
  });
});
