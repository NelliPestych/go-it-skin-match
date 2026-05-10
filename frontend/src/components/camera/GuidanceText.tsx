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
 * The hint is suppressed when it would just restate the headline
 * verbatim — most commonly on side poses where both end up as
 * "Turn your face left/right".
 */
import type { GuidanceReport } from "../../types/camera";

interface Props {
  report: GuidanceReport;
  hint?: string;
}

function sameMessage(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export default function GuidanceText({ report, hint }: Props) {
  if (report.status === "aligned") return null;
  const showHint = !!hint && !sameMessage(hint, report.message);
  return (
    <div className="sc-guidance" role="status" aria-live="polite">
      <div className="sc-guidance-text">{report.message}</div>
      {showHint && <div className="sc-guidance-hint">{hint}</div>}
    </div>
  );
}
