import { ChangeEvent, useState } from "react";

interface Props {
  onSelect: (file: File) => void;
  disabled?: boolean;
}

export default function ImageUpload({ onSelect, disabled }: Props) {
  const [preview, setPreview] = useState<string | null>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    onSelect(file);
  };

  return (
    <div className="uploader">
      <p className="muted">Upload a clear, front-facing photo (JPG/PNG/WEBP, ≤10MB).</p>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        disabled={disabled}
      />
      {preview && <img src={preview} alt="preview" className="preview" />}
    </div>
  );
}
