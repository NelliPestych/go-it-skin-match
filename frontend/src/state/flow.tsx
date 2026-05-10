import { ReactNode, createContext, useContext, useMemo, useState } from "react";

import type { Concern, SkinType } from "../types";

/** Optional side photos from the Smart Camera 3-shot capture.  When
 *  the user goes through the manual uploader these stay null — the
 *  AnalyzingPage falls back to the legacy single-image POST. */
export interface AdditionalImages {
  left: File | null;
  right: File | null;
}

interface FlowState {
  imageFile: File | null;
  setImageFile: (f: File | null) => void;
  /** Side photos from the Smart Camera, both nullable.  Set together
   *  with `imageFile` (= front) on capture review. */
  additionalImages: AdditionalImages;
  setAdditionalImages: (extras: AdditionalImages) => void;
  skinType: SkinType | null;
  setSkinType: (t: SkinType) => void;
  concerns: Concern[];
  toggleConcern: (c: Concern) => void;
  reset: () => void;
}

const EMPTY_EXTRAS: AdditionalImages = { left: null, right: null };

const FlowContext = createContext<FlowState | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [additionalImages, setAdditionalImages] =
    useState<AdditionalImages>(EMPTY_EXTRAS);
  const [skinType, setSkinType] = useState<SkinType | null>(null);
  const [concerns, setConcerns] = useState<Concern[]>([]);

  const value = useMemo<FlowState>(
    () => ({
      imageFile,
      // Reset side photos whenever the front photo is replaced — the
      // user picked a fresh capture, so the previous side angles
      // are no longer in sync with it.
      setImageFile: (f) => {
        setImageFile(f);
        setAdditionalImages(EMPTY_EXTRAS);
      },
      additionalImages,
      setAdditionalImages,
      skinType,
      setSkinType,
      concerns,
      toggleConcern: (c) =>
        setConcerns((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])),
      reset: () => {
        setImageFile(null);
        setAdditionalImages(EMPTY_EXTRAS);
        setSkinType(null);
        setConcerns([]);
      },
    }),
    [imageFile, additionalImages, skinType, concerns],
  );

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow(): FlowState {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error("useFlow must be used inside FlowProvider");
  return ctx;
}
