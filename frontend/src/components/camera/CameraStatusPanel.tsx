/**
 * CameraStatusPanel — three status chips at the top of the camera
 * stage, styled after La Roche-Posay SpotScan.
 *
 * Each chip turns green when its own gate is satisfied and red while
 * the user still has work to do. The third chip's label changes per
 * pose so the user always sees the pose-specific instruction in the
 * persistent UI, not just in the centred banner.
 *
 * A close button on the right exits the camera flow.
 */
import type { CaptureStep, GateChecks } from "../../types/camera";

const POSE_LABEL: Record<CaptureStep, string> = {
  front: "Look straight",
  left: "Turn left",
  right: "Turn right",
};

interface Props {
  gates: GateChecks;
  pose: CaptureStep;
  onClose?: () => void;
}

function Chip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className="sc-chip" data-state={ok ? "ok" : "fail"}>
      {label}
    </span>
  );
}

export default function CameraStatusPanel({ gates, pose, onClose }: Props) {
  return (
    <div className="sc-status-panel">
      <div className="sc-chips">
        <Chip label="Lighting" ok={gates.lightingOk} />
        <Chip label="Face position" ok={gates.positionOk} />
        <Chip label={POSE_LABEL[pose]} ok={gates.poseOk} />
      </div>
      {onClose && (
        <button className="sc-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      )}
    </div>
  );
}
