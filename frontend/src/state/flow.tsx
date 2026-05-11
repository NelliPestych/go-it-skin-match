import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import {
  mapConcernsToLegacy,
  mapSkinTypeToLegacy,
} from "../services/quizMapping";
import type { Concern, SkinType } from "../types";
import type { QuizAnswers, SkinConcern } from "../types/quiz";

/** Optional side photos from the Smart Camera 3-shot capture.  When
 *  the user goes through the manual uploader these stay null — the
 *  AnalyzingPage falls back to the legacy single-image POST. */
export interface AdditionalImages {
  left: File | null;
  right: File | null;
}

/**
 * FlowProvider exposes two faces of the same underlying state:
 *
 * 1. **Canonical (new)** — `quizAnswers` + `setQuizAnswer` +
 *    `toggleQuizConcern`.  The new config-driven QuizPage reads and
 *    writes this directly.
 *
 * 2. **Legacy (back-compat)** — `skinType`, `concerns`, `setSkinType`,
 *    `toggleConcern`.  These are kept in the interface so that the
 *    not-yet-deleted `QuizSkinTypePage.tsx` / `QuizConcernsPage.tsx`
 *    still type-check (per the user's "do not delete old pages yet"
 *    rule), and so that any consumer that already reads them
 *    (notably `AnalyzingPage` before Step 3 lands) keeps working.
 *
 *    Read paths (`skinType`, `concerns`) are **derived** from
 *    `quizAnswers` via the pure mappers in `services/quizMapping.ts`,
 *    so there is exactly one source of truth.
 *
 *    Write paths (`setSkinType`, `toggleConcern`) keep their old
 *    signatures.  `setSkinType` writes through into
 *    `quizAnswers.skin_type` because legacy `SkinType ⊂
 *    SkinTypeAnswer`.  `toggleConcern` is intentionally a no-op:
 *    the only caller is the unmounted legacy QuizConcernsPage, and
 *    reverse-mapping a legacy concern back into the richer UI set
 *    would be ambiguous (`"pores"` maps from both `large_pores` and
 *    `acne_breakouts`).  Documented in-line below.
 */
interface FlowState {
  imageFile: File | null;
  setImageFile: (f: File | null) => void;
  additionalImages: AdditionalImages;
  setAdditionalImages: (extras: AdditionalImages) => void;

  // ── Canonical quiz state ─────────────────────────────────────────
  quizAnswers: QuizAnswers;
  setQuizAnswer: <K extends keyof QuizAnswers>(key: K, value: QuizAnswers[K]) => void;
  toggleQuizConcern: (c: SkinConcern) => void;

  // ── Legacy back-compat (derived / shim) ──────────────────────────
  /** Legacy single-value skin type. Computed from `quizAnswers.skin_type`
   *  via the pure mapper — `"not_sure"` collapses to `null`. */
  skinType: SkinType | null;
  /** Back-compat setter. Writes into `quizAnswers.skin_type`. */
  setSkinType: (t: SkinType) => void;
  /** Legacy concern list, derived from `quizAnswers.concerns` through
   *  `mapConcernsToLegacy(...)`.  We additionally append `"sensitivity"`
   *  when `quizAnswers.sensitivity === "very_sensitive"` so that the
   *  pre-Step-3 `AnalyzingPage`, which derives the legacy boolean
   *  `sensitivity` via `concerns.includes("sensitivity")`, still
   *  receives the right signal during the brief Step 2 → Step 3 window. */
  concerns: Concern[];
  /** Back-compat no-op. The legacy QuizConcernsPage is unmounted by
   *  the routing redirect; this setter is kept only so the file
   *  itself continues to type-check until the eventual cleanup. */
  toggleConcern: (c: Concern) => void;

  reset: () => void;
}

const EMPTY_EXTRAS: AdditionalImages = { left: null, right: null };
const EMPTY_ANSWERS: QuizAnswers = {};

const FlowContext = createContext<FlowState | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  const [imageFile, setImageFileRaw] = useState<File | null>(null);
  const [additionalImages, setAdditionalImages] =
    useState<AdditionalImages>(EMPTY_EXTRAS);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswers>(EMPTY_ANSWERS);

  const setImageFile = useCallback((f: File | null) => {
    setImageFileRaw(f);
    // Replacing the front photo must wipe the stale side photos so a
    // new front never ends up paired with old sides from a previous
    // Smart Camera session.
    setAdditionalImages(EMPTY_EXTRAS);
  }, []);

  const setQuizAnswer = useCallback(
    <K extends keyof QuizAnswers>(key: K, value: QuizAnswers[K]) => {
      setQuizAnswers((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const toggleQuizConcern = useCallback((c: SkinConcern) => {
    setQuizAnswers((prev) => {
      const current = prev.concerns ?? [];
      const next = current.includes(c)
        ? current.filter((x) => x !== c)
        : [...current, c];
      return { ...prev, concerns: next };
    });
  }, []);

  const reset = useCallback(() => {
    setImageFileRaw(null);
    setAdditionalImages(EMPTY_EXTRAS);
    setQuizAnswers(EMPTY_ANSWERS);
  }, []);

  // Derived legacy views — recomputed on every quizAnswers change.
  // useMemo keeps the array identity stable for downstream `useEffect`
  // dependency arrays (otherwise AnalyzingPage would re-trigger its
  // submit effect every render).
  const skinType: SkinType | null = useMemo(
    () => mapSkinTypeToLegacy(quizAnswers.skin_type) ?? null,
    [quizAnswers.skin_type],
  );

  const concerns: Concern[] = useMemo(() => {
    const mapped = mapConcernsToLegacy(quizAnswers.concerns);
    // Preserve the legacy "sensitivity-as-concern" signal that the
    // pre-Step-3 AnalyzingPage uses to derive its boolean. Step 3
    // will switch AnalyzingPage to read quizAnswers.sensitivity
    // directly and this branch becomes a no-op.
    if (
      quizAnswers.sensitivity === "very_sensitive" &&
      !mapped.includes("sensitivity")
    ) {
      return [...mapped, "sensitivity"].sort() as Concern[];
    }
    return mapped;
  }, [quizAnswers.concerns, quizAnswers.sensitivity]);

  // ── Legacy setters (delegating into quizAnswers) ─────────────────
  const setSkinType = useCallback(
    (t: SkinType) => {
      setQuizAnswers((prev) => ({ ...prev, skin_type: t }));
    },
    [],
  );

  // Documented in the interface above: intentionally a no-op.
  const toggleConcern = useCallback((_c: Concern) => {
    /* no-op — see FlowState.toggleConcern docstring */
  }, []);

  const value = useMemo<FlowState>(
    () => ({
      imageFile,
      setImageFile,
      additionalImages,
      setAdditionalImages,
      quizAnswers,
      setQuizAnswer,
      toggleQuizConcern,
      skinType,
      setSkinType,
      concerns,
      toggleConcern,
      reset,
    }),
    [
      imageFile,
      setImageFile,
      additionalImages,
      quizAnswers,
      setQuizAnswer,
      toggleQuizConcern,
      skinType,
      setSkinType,
      concerns,
      toggleConcern,
      reset,
    ],
  );

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow(): FlowState {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error("useFlow must be used inside FlowProvider");
  return ctx;
}
