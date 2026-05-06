import type { RecommendationItem } from "../types";

interface Props {
  items: RecommendationItem[];
}

export default function RecommendationsList({ items }: Props) {
  if (!items.length) {
    return (
      <div className="card">
        <p className="muted">No recommendations yet — try submitting the quiz first.</p>
      </div>
    );
  }
  return (
    <div className="card">
      <h3 className="section-title">Recommended products</h3>
      <div className="grid cols-2">
        {items.map((item) => (
          <div className="product-card" key={item.product.id}>
            <span className="score">score {item.score.toFixed(2)}</span>
            <h4>
              {item.product.brand} — {item.product.name}
            </h4>
            <div className="meta">
              {item.product.category} · ${item.product.price.toFixed(2)}
            </div>
            <div>
              {item.product.skin_types.map((s) => (
                <span className="badge" key={s}>
                  {s}
                </span>
              ))}
            </div>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {item.reasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
            {item.product.affiliate_url && (
              <a href={item.product.affiliate_url} target="_blank" rel="noreferrer">
                View product →
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
