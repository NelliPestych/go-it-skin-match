/**
 * GuidanceText — large attention text positioned above the framing
 * oval, surfaced when alignment is failing.
 *
 * Hidden when the report says "aligned" — the green oval, the green
 * chips, and the countdown badge all communicate "ready" without
 * extra noise here.
 *
 * `report.message` becomes the headline; an optional `hint` line
 * adds the pose-specific elaboration (e.g. "Look at the screen").
 */
import type { GuidanceReport } from "../../types/camera";

interface Props {
  report: GuidanceReport;
  hint?: string;
}

export default function GuidanceText({ report, hint }: Props) {
  if (report.status === "aligned") return null;
  return (
    <div className="sc-guidance" role="status" aria-live="polite">
      <div className="sc-guidance-text">{report.message}</div>
      {hint && <div className="sc-guidance-hint">{hint}</div>}
    </div>
  );
}
