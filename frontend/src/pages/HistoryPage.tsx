import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import IconButton from "../components/IconButton";
import PillButton from "../components/PillButton";
import { api, isUnauthorized } from "../services/api";
import { useAuth } from "../state/auth";
import type { AnalysisHistoryItem } from "../types";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [items, setItems] = useState<AnalysisHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.history();
        if (!cancelled) setItems(data);
      } catch (err) {
        // 401 → AuthProvider redirects; skip the flash error.
        if (cancelled || isUnauthorized(err)) return;
        setError(err instanceof Error ? err.message : "Failed to load history");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="screen relative history-screen" style={{ background: "var(--bg-results)" }}>
      <div className="blob rose-bottom-left" />
      <div className="blob lavender-top-right" />

      <div className="app-header relative">
        <IconButton onClick={() => navigate("/")} aria-label="Back">
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
            <path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </IconButton>
        <div className="app-header-center">
          <span className="eyebrow">My Results</span>
          <div className="divider" style={{ background: "var(--peach)" }} />
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="text-link"
          style={{ fontSize: 12, padding: 0 }}
          aria-label="Log out"
        >
          Log out
        </button>
      </div>

      <div className="screen-pad relative">
        <h1 className="h1" style={{ marginBottom: 8 }}>
          Your skin journey
        </h1>
        <p className="body" style={{ marginBottom: user ? 4 : 24 }}>
          Every analysis you run is saved here so you can compare and follow up.
        </p>
        {user && (
          <p
            className="body"
            style={{ marginBottom: 24, fontSize: 12, opacity: 0.65 }}
          >
            Signed in as {user.email}
          </p>
        )}

        {error && <div className="error">{error}</div>}

        {items && items.length === 0 && (
          <div className="card-empty">
            <p className="muted" style={{ marginBottom: 12 }}>
              No analyses yet. Run your first analysis to see it here.
            </p>
            <PillButton onClick={() => navigate("/capture")}>Start analysis</PillButton>
          </div>
        )}

        {!items && !error && (
          <>
            <div className="skeleton" style={{ height: 96, marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 96, marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 96 }} />
          </>
        )}

        {items && items.length > 0 && (
          <div className="history-list">
            {items.map((item) => (
              <Link
                key={item.analysis_id}
                to={`/results/${item.analysis_id}`}
                className="history-card"
                aria-label={`Open analysis ${item.analysis_id}`}
              >
                <div className="history-card-head">
                  <div>
                    <div className="caption">{formatDate(item.created_at)}</div>
                    <h3 className="font-serif" style={{ textTransform: "capitalize", margin: "4px 0 0", fontSize: 24 }}>
                      {item.skin_type}
                    </h3>
                  </div>
                  <span className="badge-pill">
                    {Math.round(item.confidence_score * 100)}% AI
                  </span>
                </div>
                {item.top_products.length > 0 && (
                  <ul className="history-card-products">
                    {item.top_products.slice(0, 3).map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                )}
                <div className="history-card-foot">
                  <span>View details</span>
                  <span>→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="screen-footer relative">
        <PillButton onClick={() => navigate("/capture")} variant="secondary">
          + New analysis
        </PillButton>
      </div>
    </div>
  );
}
