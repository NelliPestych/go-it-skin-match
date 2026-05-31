/**
 * Smart Camera intro — entry point at `/capture`.
 *
 * Shows the four pre-shot rules (remove glasses / pull hair back /
 * neutral expression / good lighting) and two equal-status CTAs:
 *   - "Take 3 selfies" → /smart-camera (LRP-style guided capture)
 *   - "Upload photo"   → opens an inline file picker; on a valid
 *     file it pushes the File into FlowProvider and continues into
 *     the existing /quiz/skin-type flow.
 *
 * The previous `CapturePage` file is kept in the codebase as a
 * fallback (per the explicit adjustment to the plan), but it's no
 * longer wired to a route — the intro inlines its file-picker logic.
 */
import { ChangeEvent, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import IconButton from "../components/IconButton";
import PillButton from "../components/PillButton";
import { useFlow } from "../state/flow";

const MAX_UPLOAD_MB = 10;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface Instruction {
  icon: string;
  title: string;
  body: string;
  /** Pastel background for the icon tile. */
  color: string;
}

const INSTRUCTIONS: Instruction[] = [
  {
    icon: "👓",
    title: "Remove glasses",
    body: "Reflective surfaces hide skin texture from the camera.",
    color: "var(--rose)",
  },
  {
    icon: "💇",
    title: "Pull your hair back",
    body: "Forehead and temples need to be visible inside the frame.",
    color: "var(--mint)",
  },
  {
    icon: "😐",
    title: "Keep a neutral expression",
    body: "Relax your face — no smiling, no squinting.",
    color: "var(--cream)",
  },
  {
    icon: "☀️",
    title: "Find good natural lighting",
    body: "Face a soft, even light source. Avoid hard shadows.",
    color: "var(--lavender)",
  },
];

export default function SmartCameraIntroPage() {
  const navigate = useNavigate();
  const flow = useFlow();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const onPickFile = () => {
    setError(null);
    fileRef.current?.click();
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ALLOWED_TYPES.includes(f.type)) {
      setError(`Unsupported file type: ${f.type || "unknown"}. Use JPG, PNG or WEBP.`);
      e.target.value = "";
      return;
    }
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(
        `File is ${(f.size / 1024 / 1024).toFixed(1)} MB — please pick one under ${MAX_UPLOAD_MB} MB.`,
      );
      e.target.value = "";
      return;
    }
    flow.setImageFile(f);
    navigate("/quiz/skin-type");
  };

  return (
    <div className="screen intro-instructions-screen">
      {/* Hidden picker triggered by "Upload photo" — the existing
          manual-upload flow with no extra screen. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onFileChange}
        style={{ display: "none" }}
      />

      <div className="app-header">
        <IconButton onClick={() => navigate("/")} aria-label="Back">
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
            <path
              d="M7 1L1 7l6 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconButton>
        {/* "AI Skin Scan" eyebrow lives in the header so the body copy
            below starts straight with the headline.  An equal-width
            spacer on the right balances the Back IconButton so the
            badge centres precisely between them. */}
        <span className="badge-pill">AI Skin Scan</span>
        <span style={{ width: 44 }} aria-hidden="true" />
      </div>

      <div className="screen-pad" style={{ marginTop: 8 }}>
        <h1 className="h1" style={{ marginBottom: 12 }}>
          Take 3 selfies
          <br />
          for your skin analysis
        </h1>
        <p className="body" style={{ marginBottom: 12 }}>
          Front, left and right shots help our AI capture your full skin profile.
        </p>
      </div>

      <div className="intro-instructions">
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Before you start
        </div>
        {INSTRUCTIONS.map((item) => (
          <div
            className="intro-instruction"
            key={item.title}
            style={{ ["--icon-bg" as string]: item.color }}
          >
            <div className="intro-instruction-icon" aria-hidden="true">
              {item.icon}
            </div>
            <div className="intro-instruction-text">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          </div>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="screen-footer">
        <PillButton onClick={() => navigate("/smart-camera")}>Take 3 selfies</PillButton>
        {/* "Upload photo" is a secondary action, so it's demoted from
            a full pill to an inline underlined link — frees the
            vertical room the second pill used to take and keeps the
            primary CTA visually unrivalled. */}
        <button
          type="button"
          className="text-link text-link--underline"
          onClick={onPickFile}
          style={{ display: "block", margin: "10px auto 0" }}
        >
          Upload photo
        </button>
      </div>
    </div>
  );
}
