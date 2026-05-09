import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import IconButton from "../components/IconButton";
import PillButton from "../components/PillButton";
import { useFlow } from "../state/flow";

export default function CapturePage() {
  const navigate = useNavigate();
  const { imageFile, setImageFile } = useFlow();
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const onPick = () => fileRef.current?.click();

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setImageFile(f);
  };

  return (
    <div className="capture-screen">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onChange}
        style={{ display: "none" }}
      />

      <div className="app-header" style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 5 }}>
        <IconButton light onClick={() => navigate(-1)} aria-label="Back" style={{ color: "white" }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </IconButton>
        <div
          className="chip"
          style={{ background: "rgba(255,255,255,0.1)", color: "white", borderColor: "rgba(255,255,255,0.3)" }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 9999, background: "var(--rose)" }} />
          <span style={{ letterSpacing: 1, fontSize: 10, fontWeight: 700 }}>AUTO MODE</span>
        </div>
        <IconButton light aria-label="Flash" style={{ color: "white" }}>
          <span style={{ fontSize: 14 }}>⚡</span>
        </IconButton>
      </div>

      <div className="photo-stage">
        {previewUrl && <img src={previewUrl} className="preview-img" alt="preview" />}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.1) 70%, rgba(0,0,0,0.6) 100%)",
          }}
        />
        <div className="capture-frame">
          <div className="corner tl" />
          <div className="corner tr" />
          <div className="corner bl" />
          <div className="corner br" />
        </div>
      </div>

      <div className="capture-bottom">
        <h2>Capture Your Glow</h2>
        <p>Ensure good natural lighting and position your face within the frame for the best AI analysis.</p>
      </div>

      <div className="capture-tip">
        <div className="dot">💡</div>
        <div>
          <strong>Tip:</strong> Remove glasses and keep your hair away from your forehead.
        </div>
      </div>

      <div className="capture-controls">
        <button className="capture-side-btn" onClick={onPick}>
          <span className="btn-circle">🖼️</span>
          <span className="label">Gallery</span>
        </button>
        <div className="ring" onClick={onPick} role="button" tabIndex={0}>
          <div className="core" />
        </div>
        <button className="capture-side-btn">
          <span className="btn-circle">↺</span>
          <span className="label">Flip</span>
        </button>
      </div>

      <div className="screen-footer" style={{ background: "transparent" }}>
        {imageFile ? (
          <PillButton onClick={() => navigate("/quiz/skin-type")}>Continue</PillButton>
        ) : (
          <PillButton variant="secondary" onClick={onPick}>
            Choose from photos
          </PillButton>
        )}
      </div>
    </div>
  );
}
