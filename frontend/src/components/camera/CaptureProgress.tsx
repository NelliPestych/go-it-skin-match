/** 3 pose-silhouette circles (front/left/right); each is active|done|todo. */
import type { CaptureImages, CaptureStep } from "../../types/camera";
import ScanFront from "./icons/ScanFront";
import ScanLeft from "./icons/ScanLeft";
import ScanRight from "./icons/ScanRight";

interface Props {
  pose: CaptureStep;
  images: CaptureImages;
}

const ORDER: CaptureStep[] = ["front", "left", "right"];

function HeadIcon({ variant }: { variant: CaptureStep }) {
  if (variant === "front") return <ScanFront />;
  if (variant === "left") return <ScanLeft />;
  return <ScanRight />;
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
