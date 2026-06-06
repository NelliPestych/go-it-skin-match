/** Quiz config validity — pins option-id sets, duplicates, required flags. */
import { describe, expect, it } from "vitest";

import { skinQuizQuestions, SKIN_QUIZ_TOTAL_STEPS } from "./skinQuiz";

// Legal option-id sets per question; keep in sync with types/quiz.ts unions.
const LEGAL_OPTION_IDS: Record<string, readonly string[]> = {
  skin_type: ["dry", "oily", "combination", "normal", "not_sure"],
  concerns: [
    "acne_breakouts",
    "redness",
    "dryness",
    "oiliness",
    "pigmentation_dark_spots",
    "fine_lines",
    "large_pores",
  ],
  sensitivity: ["very_sensitive", "sometimes_reacts", "not_sensitive"],
  routine_level: ["regularly", "sometimes", "no"],
  breakout_frequency: ["often", "sometimes", "rarely", "never"],
  daily_environment: ["urban_pollution", "mostly_indoors", "sunny_outdoor"],
  sunscreen_usage: ["daily", "sometimes", "rarely_never"],
};

describe("skinQuizQuestions config", () => {
  it("exposes exactly 7 questions and matches SKIN_QUIZ_TOTAL_STEPS", () => {
    expect(skinQuizQuestions).toHaveLength(7);
    expect(SKIN_QUIZ_TOTAL_STEPS).toBe(skinQuizQuestions.length);
  });

  it("has a unique answer slot for every question (no two questions write to the same key)", () => {
    const ids = skinQuizQuestions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(skinQuizQuestions.map((q) => [q.id, q]))(
    "question %s — required questions carry at least 2 options",
    (_id, question) => {
      if (question.required) {
        expect(question.options.length).toBeGreaterThanOrEqual(2);
      }
    },
  );

  it.each(skinQuizQuestions.map((q) => [q.id, q]))(
    "question %s — every option has a non-empty id and label",
    (_id, question) => {
      for (const opt of question.options) {
        expect(opt.id.length).toBeGreaterThan(0);
        expect(opt.label.length).toBeGreaterThan(0);
      }
    },
  );

  it.each(skinQuizQuestions.map((q) => [q.id, q]))(
    "question %s — option ids are unique within the question",
    (_id, question) => {
      const ids = question.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  it.each(skinQuizQuestions.map((q) => [q.id, q]))(
    "question %s — every option id is a legal value of the parent answer union",
    (_id, question) => {
      const legal = LEGAL_OPTION_IDS[question.id];
      // If a future question adds a new answer slot, make sure to
      // extend LEGAL_OPTION_IDS above. Failing this assert means
      // either the config drifted or this test fixture is stale.
      expect(legal, `LEGAL_OPTION_IDS missing entry for ${question.id}`).toBeDefined();
      for (const opt of question.options) {
        expect(
          legal.includes(opt.id),
          `option "${opt.id}" on question "${question.id}" is not a legal value`,
        ).toBe(true);
      }
    },
  );

  it("the only multi-select question is `concerns`", () => {
    // The Step-2 QuizPage hard-codes the cast `optionId as SkinConcern`
    // in its multi-toggle handler. If we ever add a second multi
    // question, that branch needs an explicit case — failing here is
    // an early-warning signal.
    const multi = skinQuizQuestions.filter((q) => q.type === "multi");
    expect(multi).toHaveLength(1);
    expect(multi[0].id).toBe("concerns");
  });
});
