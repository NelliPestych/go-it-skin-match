/**
 * CaptureProgress — bottom row of three head-silhouette circles
 * (front / left / right). Each one can be in three states:
 *
 *   active — bigger, white border, white silhouette icon
 *   done   — green border + green check (silhouette swapped for the
 *            check so a finished pose reads as "complete")
 *   todo   — small, dim border, dim silhouette
 *
 * The icons are inline SVG line-art bust drawings — head + hair +
 * shoulders — with subtle pose differences so each one reads as
 * facing-forward / 3-quarters-left / 3-quarters-right at a glance.
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

const SVG_PROPS = {
  viewBox: "0 0 32 32",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function HeadFront() {
  return (
    <svg {...SVG_PROPS} aria-hidden="true">
      {/* Hair top — small bun + crown curve */}
      <circle cx="16" cy="6" r="1.8" fill="currentColor" stroke="none" />
      <path d="M9.5 11.5 Q9.5 6.5 16 6.5 Q22.5 6.5 22.5 11.5" />
      {/* Face / head */}
      <ellipse cx="16" cy="13" rx="5" ry="6" />
      {/* Neck */}
      <path d="M13.5 18.5 L13.5 21 M18.5 18.5 L18.5 21" />
      {/* Shoulders */}
      <path d="M5 28 Q5 22 13 21 L19 21 Q27 22 27 28" />
    </svg>
  );
}

function HeadLeft() {
  return (
    <svg {...SVG_PROPS} aria-hidden="true">
      {/* Hair bun shifted toward back of head (right side of icon) */}
      <circle cx="14" cy="6" r="1.8" fill="currentColor" stroke="none" />
      <path d="M8.5 11.5 Q9 6.5 14 6.5 Q21 6.5 22.5 12" />
      {/* Head turned 3/4 to the left */}
      <ellipse cx="12.5" cy="13" rx="5" ry="6" />
      {/* Hair flowing back behind the head */}
      <path d="M17.5 9.5 Q21.5 11.5 21.5 16" />
      {/* Neck */}
      <path d="M11 18.5 L11 21 M16 18.5 L16 21" />
      {/* Shoulders — slightly off-centre */}
      <path d="M3.5 28 Q3.5 22 11 21 L17 21 Q24 22 25 28" />
    </svg>
  );
}

function HeadRight() {
  return (
    <svg {...SVG_PROPS} aria-hidden="true">
      {/* Mirror of HeadLeft — hair bun at left side */}
      <circle cx="18" cy="6" r="1.8" fill="currentColor" stroke="none" />
      <path d="M9.5 12 Q11 6.5 18 6.5 Q23 6.5 23.5 11.5" />
      {/* Head turned 3/4 to the right */}
      <ellipse cx="19.5" cy="13" rx="5" ry="6" />
      {/* Hair flowing back behind the head (left side now) */}
      <path d="M14.5 9.5 Q10.5 11.5 10.5 16" />
      {/* Neck */}
      <path d="M16 18.5 L16 21 M21 18.5 L21 21" />
      {/* Shoulders */}
      <path d="M7 28 Q8 22 15 21 L21 21 Q28.5 22 28.5 28" />
    </svg>
  );
}

function HeadIcon({ variant }: { variant: CaptureStep }) {
  if (variant === "front") return <HeadFront />;
  if (variant === "left") return <HeadLeft />;
  return <HeadRight />;
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
            {isDone ? <CheckIcon /> : <HeadIcon variant={p} />}
          </div>
        );
      })}
    </div>
  );
}
