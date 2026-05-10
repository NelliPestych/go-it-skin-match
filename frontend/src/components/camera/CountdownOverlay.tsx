/**
 * CountdownOverlay — large 3 / 2 / 1 digit shown in the centre of
 * the camera frame while `useSmartCaptureFlow.status === "counting"`.
 *
 * The hook derives `digit` from countdown progress; this component
 * is a thin renderer that re-mounts on each digit change via
 * `key={digit}` so the `sc-countdown-pop` keyframe replays per tick.
 */
interface Props {
  /** 3 / 2 / 1 — or 0 to hide the badge entirely. */
  digit: number;
}

export default function CountdownOverlay({ digit }: Props) {
  if (digit <= 0) return null;
  return (
    <div className="sc-countdown" key={digit} aria-hidden="true">
      {digit}
    </div>
  );
}
