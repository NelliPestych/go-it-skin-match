import type { BeautyPlan } from "../types";

interface Props {
  plan: BeautyPlan;
}

export default function BeautyPlanView({ plan }: Props) {
  return (
    <div className="card">
      <h3 className="section-title">Daily beauty plan</h3>
      <p className="muted">{plan.summary}</p>

      <div className="grid cols-2">
        <div>
          <h4>☀️ Morning</h4>
          <ul className="routine-list">
            {plan.daily.morning.map((step) => (
              <li key={`m-${step.order}`}>
                <strong>{step.order}. {step.product_name}</strong>
                <div className="muted">{step.instruction}</div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4>🌙 Evening</h4>
          <ul className="routine-list">
            {plan.daily.evening.map((step) => (
              <li key={`e-${step.order}`}>
                <strong>{step.order}. {step.product_name}</strong>
                <div className="muted">{step.instruction}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <h4 style={{ marginTop: 24 }}>Weekly tips</h4>
      <ul className="routine-list">
        {plan.weekly_tips.map((t, i) => (
          <li key={i}>
            <strong>{t.day}:</strong> {t.tip}
          </li>
        ))}
      </ul>

      <h4>Lifestyle</h4>
      <ul>
        {plan.lifestyle_tips.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
