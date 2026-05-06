import type { SkinFeatures } from "../types";

interface Props {
  features: SkinFeatures;
}

export default function AnalysisResult({ features }: Props) {
  return (
    <div className="card">
      <h3 className="section-title">Skin analysis</h3>
      <div className="feature-row">
        <span>Skin type</span>
        <span className="badge">{features.skin_type}</span>
      </div>
      <div className="feature-row">
        <span>Redness</span>
        <span className="badge">{features.redness_level}</span>
      </div>
      <div className="feature-row">
        <span>Hydration</span>
        <span className="badge">{features.hydration_level}</span>
      </div>
      <div className="feature-row">
        <span>Pigmentation</span>
        <span className="badge">{features.pigmentation_level}</span>
      </div>
      <div className="feature-row">
        <span>Pores score</span>
        <span>{(features.pores_score * 100).toFixed(0)} / 100</span>
      </div>
      <div className="feature-row">
        <span>Confidence</span>
        <span>{(features.confidence_score * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}
