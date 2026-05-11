/**
 * PoseArrow — animated chevron next to the framing oval that points
 * toward the side the user should turn their face. Hidden when the
 * pose gate is already satisfied or when the target is "front" (no
 * direction implied).
 *
 * Mirroring: in the selfie-mirrored preview the user's left side is
 * on the visual left, so:
 *   pose === "left"  → chevron on the left, pointing left
 *   pose === "right" → chevron on the right, pointing right
 *
 * The bounce keyframes are split per side so both arrows visibly
 * "lean" toward the direction the user should turn.
 */
import type { CaptureStep } from "../../types/camera";

interface Props {
  pose: CaptureStep;
  /** False when the pose gate already passes — hides the arrow. */
  visible: boolean;
}

export default function PoseArrow({ pose, visible }: Props) {
  if (!visible || pose === "front") return null;
  // Two ready-made paths so we don't fight CSS scaleX flips and keep
  // the bounce animation readable per side.
  const path = pose === "left" ? "M14 5l-7 7 7 7" : "M10 5l7 7-7 7";
  return (
    <div className={`sc-arrow sc-arrow-${pose}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d={path}
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
