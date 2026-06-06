/** Headline above the oval when not aligned; hint suppressed if it duplicates the headline. */
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
