import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import BeautyPlanView from "../components/BeautyPlan";
import RecommendationsList from "../components/RecommendationsList";
import { api } from "../services/api";
import type { BeautyPlan, RecommendationResponse } from "../types";

export default function ResultsPage() {
  const { analysisId } = useParams();
  const id = Number(analysisId);
  const [recos, setRecos] = useState<RecommendationResponse | null>(null);
  const [plan, setPlan] = useState<BeautyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [r, p] = await Promise.all([api.recommendations(id), api.plan(id)]);
        if (cancelled) return;
        setRecos(r);
        setPlan(p);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <p className="muted">Loading your match…</p>;
  if (error)
    return (
      <div>
        <div className="error">{error}</div>
        <Link to="/analyze">Try again</Link>
      </div>
    );

  return (
    <section>
      <h2>Your SkinMatch results</h2>
      {recos && <RecommendationsList items={recos.items} />}
      {plan && <BeautyPlanView plan={plan} />}
      <Link to="/analyze">
        <button className="ghost">Run another analysis</button>
      </Link>
    </section>
  );
}
