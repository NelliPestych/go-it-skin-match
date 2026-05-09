import { ReactNode, createContext, useContext, useMemo, useState } from "react";

import type { Concern, SkinType } from "../types";

interface FlowState {
  imageFile: File | null;
  setImageFile: (f: File | null) => void;
  skinType: SkinType | null;
  setSkinType: (t: SkinType) => void;
  concerns: Concern[];
  toggleConcern: (c: Concern) => void;
  reset: () => void;
}

const FlowContext = createContext<FlowState | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [skinType, setSkinType] = useState<SkinType | null>(null);
  const [concerns, setConcerns] = useState<Concern[]>([]);

  const value = useMemo<FlowState>(
    () => ({
      imageFile,
      setImageFile,
      skinType,
      setSkinType,
      concerns,
      toggleConcern: (c) =>
        setConcerns((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])),
      reset: () => {
        setImageFile(null);
        setSkinType(null);
        setConcerns([]);
      },
    }),
    [imageFile, skinType, concerns],
  );

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow(): FlowState {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error("useFlow must be used inside FlowProvider");
  return ctx;
}
