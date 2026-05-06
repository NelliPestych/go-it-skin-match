import { FormEvent, useState } from "react";

import type { Concern, QuizPayload, SkinType } from "../types";

const CONCERNS: { value: Concern; label: string }[] = [
  { value: "redness", label: "Redness" },
  { value: "pigmentation", label: "Pigmentation" },
  { value: "hydration", label: "Hydration" },
  { value: "pores", label: "Pores" },
  { value: "oiliness", label: "Oiliness" },
  { value: "sensitivity", label: "Sensitivity" },
];

interface Props {
  analysisId: number;
  onSubmit: (payload: QuizPayload) => void;
  submitting?: boolean;
}

export default function Quiz({ analysisId, onSubmit, submitting }: Props) {
  const [skin, setSkin] = useState<SkinType | "">("");
  const [concerns, setConcerns] = useState<Concern[]>([]);
  const [sensitivity, setSensitivity] = useState(false);
  const [age, setAge] = useState("");
  const [budget, setBudget] = useState<"low" | "medium" | "high" | "">("");

  const toggleConcern = (concern: Concern) => {
    setConcerns((prev) =>
      prev.includes(concern) ? prev.filter((c) => c !== concern) : [...prev, concern],
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      analysis_id: analysisId,
      self_reported_skin_type: skin || undefined,
      concerns,
      sensitivity,
      age_range: age || undefined,
      budget: budget || undefined,
    });
  };

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3 className="section-title">Quick quiz</h3>

      <div style={{ marginBottom: 16 }}>
        <label className="muted">How would you describe your skin?</label>
        <div className="checkbox-group" style={{ marginTop: 8 }}>
          {(["dry", "oily", "combination", "normal"] as SkinType[]).map((s) => (
            <label key={s}>
              <input
                type="radio"
                name="skin"
                value={s}
                checked={skin === s}
                onChange={() => setSkin(s)}
              />
              {s}
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label className="muted">Top concerns (pick any):</label>
        <div className="checkbox-group" style={{ marginTop: 8 }}>
          {CONCERNS.map((c) => (
            <label key={c.value}>
              <input
                type="checkbox"
                checked={concerns.includes(c.value)}
                onChange={() => toggleConcern(c.value)}
              />
              {c.label}
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>
          <input
            type="checkbox"
            checked={sensitivity}
            onChange={(e) => setSensitivity(e.target.checked)}
          />{" "}
          My skin is reactive / sensitive
        </label>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <label>
          <span className="muted">Age range</span>
          <select value={age} onChange={(e) => setAge(e.target.value)}>
            <option value="">—</option>
            <option value="13-17">13–17</option>
            <option value="18-24">18–24</option>
            <option value="25-34">25–34</option>
            <option value="35-44">35–44</option>
            <option value="45+">45+</option>
          </select>
        </label>
        <label>
          <span className="muted">Budget</span>
          <select value={budget} onChange={(e) => setBudget(e.target.value as typeof budget)}>
            <option value="">—</option>
            <option value="low">Low (≤$20)</option>
            <option value="medium">Medium (≤$50)</option>
            <option value="high">High ($50+)</option>
          </select>
        </label>
      </div>

      <button type="submit" disabled={submitting}>
        {submitting ? "Submitting…" : "Submit and get recommendations"}
      </button>
    </form>
  );
}
