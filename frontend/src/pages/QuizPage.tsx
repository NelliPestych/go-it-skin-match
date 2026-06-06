/** Renders one of the 7 config-driven quiz questions at /quiz/:step. */
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

/** 1-based step index; safe fallback to 1 on bad input. */
function parseStep(raw: string | undefined): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > SKIN_QUIZ_TOTAL_STEPS) return 1;
  return n;
}

function isAnswered(question: QuizQuestion, answers: QuizAnswers): boolean {
  const value = answers[question.id];
  if (question.type === "single") {
    return typeof value === "string" && value.length > 0;
  }
  return Array.isArray(value) && value.length > 0;
}

export default function QuizPage() {
  const navigate = useNavigate();
  const { step: stepParam } = useParams<{ step: string }>();
  const step = parseStep(stepParam);
  const question = skinQuizQuestions[step - 1];

  const flow = useFlow();
  const { imageFile, quizAnswers, setQuizAnswer, toggleQuizConcern } = flow;

  // Direct /quiz/* without an image → /capture.
  useEffect(() => {
    if (!imageFile) navigate("/capture", { replace: true });
  }, [imageFile, navigate]);

  // Normalise /quiz/foo, /quiz/99 → /quiz/1 via replace.
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
    // Cast is safe — every config option.id is a legal value of the question's union.
    setQuizAnswer(question.id, optionId as QuizAnswers[typeof question.id]);
  };

  const handleMultiToggle = (optionId: string) => {
    // Concerns is the only multi-select; future ones need their own branch.
    if (question.id === "concerns") {
      toggleQuizConcern(optionId as SkinConcern);
    }
  };

  return (
    <div className="screen relative quiz-screen">
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
