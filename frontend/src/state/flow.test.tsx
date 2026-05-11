/**
 * FlowProvider behavioural tests.
 *
 * Two clusters of invariants:
 *
 * 1. Image-state (pre-existing): replacing the front photo MUST
 *    clear any stale side photos — otherwise a user who retakes via
 *    the manual uploader would accidentally send the old Smart
 *    Camera sides up with a fresh front, producing a mismatched
 *    3-image scan.
 *
 * 2. Quiz-state (Step 2+): the canonical `quizAnswers` bag and the
 *    legacy-compat derived `skinType` / `concerns` views must stay
 *    in sync via the pure mappers.  Failing to project the new
 *    answer set to the legacy shape would silently break the
 *    `AnalyzingPage` submit flow and / or the recommendation engine.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FlowProvider, useFlow } from "./flow";

function wrapper({ children }: { children: React.ReactNode }) {
  return <FlowProvider>{children}</FlowProvider>;
}

function fakeFile(name: string) {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
}

describe("FlowProvider", () => {
  it("setImageFile clears previously-set additionalImages", () => {
    const { result } = renderHook(() => useFlow(), { wrapper });

    act(() => {
      result.current.setImageFile(fakeFile("front-1.jpg"));
      result.current.setAdditionalImages({
        left: fakeFile("left-1.jpg"),
        right: fakeFile("right-1.jpg"),
      });
    });

    expect(result.current.additionalImages.left?.name).toBe("left-1.jpg");
    expect(result.current.additionalImages.right?.name).toBe("right-1.jpg");

    // Replacing the front photo must wipe the stale side photos.
    act(() => {
      result.current.setImageFile(fakeFile("front-2.jpg"));
    });

    expect(result.current.imageFile?.name).toBe("front-2.jpg");
    expect(result.current.additionalImages.left).toBeNull();
    expect(result.current.additionalImages.right).toBeNull();
  });

  it("reset() wipes both the front and the additional images", () => {
    const { result } = renderHook(() => useFlow(), { wrapper });

    act(() => {
      result.current.setImageFile(fakeFile("front.jpg"));
      result.current.setAdditionalImages({
        left: fakeFile("left.jpg"),
        right: fakeFile("right.jpg"),
      });
      result.current.reset();
    });

    expect(result.current.imageFile).toBeNull();
    expect(result.current.additionalImages.left).toBeNull();
    expect(result.current.additionalImages.right).toBeNull();
  });
});

describe("FlowProvider — quiz state", () => {
  it("setQuizAnswer writes a typed slot into quizAnswers", () => {
    const { result } = renderHook(() => useFlow(), { wrapper });
    act(() => {
      result.current.setQuizAnswer("skin_type", "dry");
      result.current.setQuizAnswer("routine_level", "regularly");
    });
    expect(result.current.quizAnswers.skin_type).toBe("dry");
    expect(result.current.quizAnswers.routine_level).toBe("regularly");
  });

  it("toggleQuizConcern adds and removes concerns idempotently", () => {
    const { result } = renderHook(() => useFlow(), { wrapper });
    act(() => result.current.toggleQuizConcern("redness"));
    expect(result.current.quizAnswers.concerns).toEqual(["redness"]);
    act(() => result.current.toggleQuizConcern("acne_breakouts"));
    expect(result.current.quizAnswers.concerns).toEqual(["redness", "acne_breakouts"]);
    act(() => result.current.toggleQuizConcern("redness"));
    expect(result.current.quizAnswers.concerns).toEqual(["acne_breakouts"]);
  });

  it("derives legacy `skinType` from quizAnswers.skin_type via the mapper", () => {
    const { result } = renderHook(() => useFlow(), { wrapper });
    expect(result.current.skinType).toBeNull();
    act(() => result.current.setQuizAnswer("skin_type", "oily"));
    expect(result.current.skinType).toBe("oily");
    act(() => result.current.setQuizAnswer("skin_type", "not_sure"));
    // "not_sure" must collapse to null so the legacy guard in
    // AnalyzingPage's pre-Step-3 code path keeps behaving correctly.
    expect(result.current.skinType).toBeNull();
  });

  it("derives legacy `concerns` from quizAnswers.concerns via the mapper", () => {
    const { result } = renderHook(() => useFlow(), { wrapper });
    act(() => {
      result.current.setQuizAnswer("concerns", [
        "acne_breakouts",
        "pigmentation_dark_spots",
      ]);
    });
    // mapped + sorted + deduplicated
    expect(result.current.concerns).toEqual(["oiliness", "pigmentation", "pores"]);
  });

  it("temporarily appends 'sensitivity' to legacy concerns when sensitivity=very_sensitive (back-compat shim)", () => {
    const { result } = renderHook(() => useFlow(), { wrapper });
    act(() => {
      result.current.setQuizAnswer("concerns", ["dryness"]);
      result.current.setQuizAnswer("sensitivity", "very_sensitive");
    });
    // hydration from "dryness" mapping + sensitivity appended for the
    // pre-Step-3 AnalyzingPage shim. Order is sorted alphabetically.
    expect(result.current.concerns).toEqual(["hydration", "sensitivity"]);
  });

  it("legacy setSkinType still writes through into quizAnswers.skin_type", () => {
    const { result } = renderHook(() => useFlow(), { wrapper });
    act(() => result.current.setSkinType("combination"));
    expect(result.current.quizAnswers.skin_type).toBe("combination");
    expect(result.current.skinType).toBe("combination");
  });

  it("reset() wipes the entire quizAnswers bag", () => {
    const { result } = renderHook(() => useFlow(), { wrapper });
    act(() => {
      result.current.setQuizAnswer("skin_type", "dry");
      result.current.toggleQuizConcern("redness");
      result.current.setQuizAnswer("sunscreen_usage", "rarely_never");
      result.current.reset();
    });
    expect(result.current.quizAnswers).toEqual({});
    expect(result.current.skinType).toBeNull();
    expect(result.current.concerns).toEqual([]);
  });
});
