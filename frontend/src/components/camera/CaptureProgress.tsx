/**
 * CaptureProgress — bottom row of three pose-silhouette circles
 * (front / left / right). Each one can be in three states:
 *
 *   active — bigger, white border, white silhouette icon
 *   done   — green border, green check (the head silhouette is
 *            replaced by the check so a finished pose reads as
 *            "complete" at a glance, like LRP SpotScan)
 *   todo   — small, dim border, dim silhouette
 *
 * The list is purely a function of (current pose, captured set);
 * the parent wires it from `useSmartCaptureFlow`.
 */
import type { CaptureImages, CaptureStep } from "../../types/camera";

interface Props {
  pose: CaptureStep;
  images: CaptureImages;
}

const ORDER: CaptureStep[] = ["front", "left", "right"];

function HeadSilhouette({ variant }: { variant: CaptureStep }) {
  // Three subtle silhouettes: shifted ellipse + chin curve so each
  // pose reads as "facing front / facing left / facing right".
  const cx = variant === "front" ? 16 : variant === "left" ? 13 : 19;
  const chinShift = variant === "front" ? 0 : variant === "left" ? -3 : 3;
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <ellipse cx={cx} cy="13" rx="6" ry="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d={`M${6 + chinShift} 28c1.5-5 5-7 10-7s8.5 2 10 7`}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5l4.2 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function CaptureProgress({ pose, images }: Props) {
  return (
    <div className="sc-progress" aria-label="Capture progress">
      {ORDER.map((p) => {
        const isDone = !!images[p];
        const isActive = p === pose && !isDone;
        const state = isDone ? "done" : isActive ? "active" : "todo";
        return (
          <div className="sc-progress-dot" key={p} data-state={state}>
            {isDone ? <CheckIcon /> : <HeadSilhouette variant={p} />}
          </div>
        );
      })}
    </div>
  );
}
