import { useNavigate } from "react-router-dom";

import IconButton from "./IconButton";

interface Props {
  step: number;
  totalSteps: number;
  hint?: string;
  onClose?: () => void;
  onBack?: () => void;
}

export default function QuizHeader({ step, totalSteps, hint, onClose, onBack }: Props) {
  const navigate = useNavigate();
  const percent = Math.round((step / totalSteps) * 100);

  return (
    <>
      <div className="app-header">
        <IconButton onClick={onBack ?? (() => navigate(-1))} aria-label="Back">
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
            <path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconButton>
        <div className="app-header-center">
          <span className="eyebrow">SkinMatch AI</span>
          <div className="divider" />
        </div>
        <IconButton onClick={onClose ?? (() => navigate("/"))} aria-label="Close">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </IconButton>
      </div>
      <div className="progress-row">
        <span className="progress-step">
          Step {step} <span className="of">of {totalSteps}</span>
        </span>
        {hint && <span className="progress-hint">{hint}</span>}
      </div>
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>
    </>
  );
}
