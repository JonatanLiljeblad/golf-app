import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useApi } from "../api/useApi";
import type { RoundSummary } from "../api/types";

type ApiError = { status: number; body: unknown };

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function MyRounds() {
  const { isAuthenticated, loginWithRedirect } = useAuth0();
  const { request } = useApi();

  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    setLoading("Loading rounds…");
    try {
      const data = await request<RoundSummary[]>("/api/v1/rounds");
      setRounds(data);
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to load rounds (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => {
    if (isAuthenticated) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="auth-card content-narrow">
        <h1 className="auth-title">My Rounds</h1>
        <p className="auth-subtitle">Log in to view your rounds.</p>
        <button className="auth-btn primary" onClick={() => loginWithRedirect()}>
          Log in
        </button>
      </div>
    );
  }

  return (
    <div className="page content-narrow">
      <div className="page-header">
        <h1 style={{ margin: 0 }}>My Rounds</h1>
        <button className="auth-btn secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {loading && <div className="auth-mono">{loading}</div>}

      {error && (
        <div className="auth-card">
          <div className="auth-mono">{error}</div>
        </div>
      )}

      {!rounds.length && !loading ? (
        <div className="auth-card">
          <div className="auth-mono">No rounds yet.</div>
          <div style={{ marginTop: ".75rem" }}>
            <Link className="auth-btn primary" to="/round/start" style={{ display: "inline-block" }}>
              Start a round
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: ".75rem" }}>
          {rounds.map((r) => (
            <div
              key={r.id}
              className="auth-card"
              style={{ margin: 0, maxWidth: "none", padding: "1rem" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <div>
                  <div style={{ fontWeight: 800 }}>
                    {r.course_name} · Round #{r.id}
                  </div>
                  <div className="auth-mono">Started: {fmtDate(r.started_at)}</div>
                  <div className="auth-mono">
                    {r.completed_at ? `Completed: ${fmtDate(r.completed_at)}` : "In progress"}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div className="auth-mono">Par {r.total_par}</div>
                  <div className="auth-mono">Strokes: {r.total_strokes ?? "—"}</div>
                  <div className="auth-mono">Players: {r.players_count}</div>
                  <div style={{ marginTop: ".5rem" }}>
                    <Link
                      className="auth-btn secondary"
                      to={`/rounds/${r.id}`}
                      style={{ display: "inline-block" }}
                    >
                      {r.completed_at ? "View scorecard" : "Resume"}
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
