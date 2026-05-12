/**
 * QuizPage — single component that renders one question of the
 * 7-step config-driven skincare quiz.  Reads `skinQuizQuestions`
 * from `config/skinQuiz.ts` and dispatches per-question UI by
 * `question.type` ("single" or "multi").  All visible copy comes
 * from the config, so the page itself stays small.
 *
 * Routing contract (`App.tsx`):
 *   /quiz/:step  where step ∈ 1..7
 *   Out-of-range or non-numeric → redirect to /quiz/1.
 *
 * Guards (identical to the legacy QuizSkinTypePage):
 *   No imageFile in flow → bounce back to /capture so the user can
 *   start a Smart Camera or manual upload first.
 *
 * Why one page and not seven:
 *   The questions differ only in copy + options + answer slot.
 *   Encoding each as its own component would duplicate Back/Continue
 *   logic, progress-bar wiring, and the imageFile guard 7×.  A
 *   single config-driven page keeps the diff small and explicit.
 */
import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

import PillButton from "../components/PillButton";
import QuizHeader from "../components/QuizHeader";
import {
  SKIN_QUIZ_TOTAL_STEPS,
  skinQuizQuestions,
} from "../config/skinQuiz";
import { useFlow } from "../state/flow";
import type {
  QuizAnswers,
  QuizOption,
  QuizQuestion,
  SkinConcern,
} from "../types/quiz";

/** Parse the `:step` URL param to a 1-based index, with a safe
 *  fallback of 1 on missing / non-numeric / out-of-range input. */
function parseStep(raw: string | undefined): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > SKIN_QUIZ_TOTAL_STEPS) return 1;
  return n;
}

/** Has the user supplied a valid answer for this question?
 *  Drives the Continue button's `disabled` prop. */
function isAnswered(question: QuizQuestion, answers: QuizAnswers): boolean {
  const value = answers[question.id];
  if (question.type === "single") {
    return typeof value === "string" && value.length > 0;
  }
  // multi-select: a non-empty array satisfies "required"
  return Array.isArray(value) && value.length > 0;
}

export default function QuizPage() {
  const navigate = useNavigate();
  const { step: stepParam } = useParams<{ step: string }>();
  const step = parseStep(stepParam);
  const question = skinQuizQuestions[step - 1];

  const flow = useFlow();
  const { imageFile, quizAnswers, setQuizAnswer, toggleQuizConcern } = flow;

  // Guard: if the user opens /quiz/* directly without an image,
  // send them back to capture.  Matches the legacy quiz pages.
  useEffect(() => {
    if (!imageFile) navigate("/capture", { replace: true });
  }, [imageFile, navigate]);

  // Normalise the URL: /quiz, /quiz/foo, /quiz/99 → /quiz/1.
  // Doing it via navigate(replace) keeps Back behaviour sensible.
  useEffect(() => {
    if (stepParam !== String(step)) {
      navigate(`/quiz/${step}`, { replace: true });
    }
  }, [stepParam, step, navigate]);

  const answered = useMemo(
    () => isAnswered(question, quizAnswers),
    [question, quizAnswers],
  );

  const onBack = () => {
    if (step > 1) navigate(`/quiz/${step - 1}`);
    else navigate("/capture");
  };

  const onContinue = () => {
    if (!answered && question.required) return;
    if (step >= SKIN_QUIZ_TOTAL_STEPS) navigate("/analyzing");
    else navigate(`/quiz/${step + 1}`);
  };

  const handleSingleSelect = (optionId: string) => {
    // The cast is safe by construction: every option.id in the
    // config corresponds to a legal value of the parent question's
    // answer union (asserted by the config-validity test in Step 6).
    setQuizAnswer(question.id, optionId as QuizAnswers[typeof question.id]);
  };

  const handleMultiToggle = (optionId: string) => {
    // The only multi-select question in the config is "concerns".
    // Guarding on `question.id === "concerns"` makes the cast safe
    // and self-documenting; any future multi-select would need its
    // own branch here (deliberately explicit, not magic).
    if (question.id === "concerns") {
      toggleQuizConcern(optionId as SkinConcern);
    }
  };

  return (
    <div className="screen relative">
      <div className="blob rose-bottom-left" />
      <div className="blob lavender-top-right" />
      <div className="blob sky-mid-left" />
      <div className="blob cream-mid-right" />

      <div className="relative">
        <QuizHeader
          step={step}
          totalSteps={SKIN_QUIZ_TOTAL_STEPS}
          hint={question.type === "multi" ? "Pick all that match your skin" : "Personalizing Results..."}
          onBack={onBack}
        />
      </div>

      <div className="screen-pad relative" style={{ marginTop: 16 }}>
        <h1 className="h1" style={{ marginBottom: 12 }}>
          {question.title}
        </h1>
        {question.subtitle && (
          <p className="body" style={{ marginBottom: 12 }}>
            {question.subtitle}
          </p>
        )}

        {question.type === "single" ? (
          <SingleSelectList
            options={question.options}
            selectedId={quizAnswers[question.id] as string | undefined}
            onSelect={handleSingleSelect}
          />
        ) : (
          <MultiSelectList
            options={question.options}
            selectedIds={(quizAnswers.concerns ?? []) as string[]}
            onToggle={handleMultiToggle}
          />
        )}
      </div>

      <div style={{ flex: 1, minHeight: 8 }} />

      <div className="screen-footer relative">
        <PillButton
          onClick={onContinue}
          disabled={question.required && !answered}
          trailingIcon={<span>→</span>}
        >
          {step === SKIN_QUIZ_TOTAL_STEPS ? "Finish" : "Continue"}
        </PillButton>
      </div>
    </div>
  );
}

// ── Presentational sub-components ───────────────────────────────────
// Kept inside this file (small, single-use) so the new feature lands
// as one cohesive unit.  Promoted to /components if reused later.

function SingleSelectList({
  options,
  selectedId,
  onSelect,
}: {
  options: QuizOption[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {options.map((opt) => {
        const selected = selectedId === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            className={"option-card" + (selected ? " selected" : "")}
            style={{ background: opt.bg ?? "white" }}
            onClick={() => onSelect(opt.id)}
            aria-pressed={selected}
          >
            <div className="icon-tile" style={{ background: "rgba(255,255,255,0.5)" }}>
              <span style={{ fontSize: 22 }}>{opt.icon ?? "•"}</span>
            </div>
            <div className="body-text">
              <h4>{opt.label}</h4>
              {opt.description && <p>{opt.description}</p>}
            </div>
            <div className="radio">{selected && "✓"}</div>
          </button>
        );
      })}
    </>
  );
}

function MultiSelectList({
  options,
  selectedIds,
  onToggle,
}: {
  options: QuizOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <>
      {options.map((opt) => {
        const selected = selectedIds.includes(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            className={"option-card option-card--compact" + (selected ? " selected" : "")}
            style={{ background: opt.bg ?? "white" }}
            onClick={() => onToggle(opt.id)}
            aria-pressed={selected}
          >
            <div className="icon-tile" style={{ background: "rgba(255,255,255,0.5)" }}>
              <span style={{ fontSize: 20 }}>{opt.icon ?? "•"}</span>
            </div>
            <div className="body-text">
              <h4>{opt.label}</h4>
            </div>
            <div className="radio">{selected && "✓"}</div>
          </button>
        );
      })}
    </>
  );
}
