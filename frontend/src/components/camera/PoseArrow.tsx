/** Chevron pointing the direction the user should turn; hidden on front + pass. */
import type { CaptureStep } from "../../types/camera";

interface Props {
  pose: CaptureStep;
  /** False when the pose gate already passes — hides the arrow. */
  visible: boolean;
}

export default function PoseArrow({ pose, visible }: Props) {
  if (!visible || pose === "front") return null;
  // Pre-flipped paths so we don't fight CSS scaleX.
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
