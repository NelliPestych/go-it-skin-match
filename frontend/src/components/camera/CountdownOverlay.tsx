/** Large 3/2/1 digit; re-mounts on change via key so the keyframe replays. */
interface Props {
  /** 3/2/1 — or 0 to hide. */
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
