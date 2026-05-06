import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <section className="hero">
      <h2>Personalized skincare, powered by computer vision.</h2>
      <p>
        Upload a photo, take a 30-second quiz, and SkinMatch builds a
        product list and a daily beauty plan tailored to your skin —
        with explanations for every recommendation.
      </p>
      <Link to="/analyze">
        <button>Start free analysis</button>
      </Link>

      <div className="grid cols-2" style={{ marginTop: 40 }}>
        <div className="card">
          <h3 className="section-title">1. Upload</h3>
          <p>Send a clear, front-facing photo of your skin.</p>
        </div>
        <div className="card">
          <h3 className="section-title">2. Analyze</h3>
          <p>
            Our AI module extracts skin type, redness, hydration,
            pigmentation, and pore signals.
          </p>
        </div>
        <div className="card">
          <h3 className="section-title">3. Match</h3>
          <p>
            A rule-based engine scores products against your features
            and quiz answers.
          </p>
        </div>
        <div className="card">
          <h3 className="section-title">4. Routine</h3>
          <p>Get a morning + evening plan and weekly tips.</p>
        </div>
      </div>
    </section>
  );
}
