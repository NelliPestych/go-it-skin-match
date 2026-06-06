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

/** Optional Smart Camera side photos; null on manual uploader path. */
export interface AdditionalImages {
  left: File | null;
  right: File | null;
}

/**
 * Canonical state is `quizAnswers`. Legacy `skinType` / `concerns` are
 * derived views kept for back-compat with unmounted legacy pages.
 */
interface FlowState {
  imageFile: File | null;
  setImageFile: (f: File | null) => void;
  additionalImages: AdditionalImages;
  setAdditionalImages: (extras: AdditionalImages) => void;

  quizAnswers: QuizAnswers;
  setQuizAnswer: <K extends keyof QuizAnswers>(key: K, value: QuizAnswers[K]) => void;
  toggleQuizConcern: (c: SkinConcern) => void;

  /** Derived from quizAnswers.skin_type; "not_sure" → null. */
  skinType: SkinType | null;
  setSkinType: (t: SkinType) => void;
  /** Derived from quizAnswers.concerns; appends "sensitivity" on very_sensitive. */
  concerns: Concern[];
  /** No-op — reverse-mapping legacy concerns to UI set would be ambiguous. */
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
    // Wipe stale side photos so a fresh front never pairs with old sides.
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

  // useMemo to keep array identity stable for downstream effect deps.
  const skinType: SkinType | null = useMemo(
    () => mapSkinTypeToLegacy(quizAnswers.skin_type) ?? null,
    [quizAnswers.skin_type],
  );

  const concerns: Concern[] = useMemo(() => {
    const mapped = mapConcernsToLegacy(quizAnswers.concerns);
    if (
      quizAnswers.sensitivity === "very_sensitive" &&
      !mapped.includes("sensitivity")
    ) {
      return [...mapped, "sensitivity"].sort() as Concern[];
    }
    return mapped;
  }, [quizAnswers.concerns, quizAnswers.sensitivity]);

  const setSkinType = useCallback(
    (t: SkinType) => {
      setQuizAnswers((prev) => ({ ...prev, skin_type: t }));
    },
    [],
  );

  const toggleConcern = useCallback((_c: Concern) => {
    /* no-op — see FlowState.toggleConcern */
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
