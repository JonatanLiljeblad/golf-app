import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";

import { useApi } from "../api/useApi";
import type { Tournament } from "../api/types";

type ApiError = { status: number; body: unknown };

export default function TournamentPage() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, loginWithRedirect } = useAuth0();
  const { request } = useApi();

  const [t, setT] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(id: number) {
    setError(null);
    setLoading("Loading tournament…");
    try {
      const data = await request<Tournament>(`/api/v1/tournaments/${id}`);
      setT(data);
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to load tournament (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return;
    const id = Number(tournamentId);
    if (!Number.isFinite(id) || id <= 0) {
      setError("Invalid tournament id.");
      return;
    }
    void load(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, tournamentId]);

  async function startMyGroup() {
    if (!t) return;
    setError(null);
    setLoading("Starting your group…");
    try {
      const res = await request<{ round_id: number }>(`/api/v1/tournaments/${t.id}/rounds`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      navigate(`/rounds/${res.round_id}`);
    } catch (e) {
      const err = e as ApiError;
      const detail =
        err.body && typeof err.body === "object" && "detail" in err.body
          ? (err.body as { detail?: unknown }).detail
          : null;
      const msg = detail != null ? String(detail) : null;
      setError(msg ? `${msg} (${err.status}).` : `Failed to start group (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-card content-narrow">
        <h1 className="auth-title">Tournament</h1>
        <p className="auth-subtitle">Log in to view tournament leaderboards.</p>
        <button className="auth-btn primary" onClick={() => loginWithRedirect()}>
          Log in
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      {error && (
        <div className="auth-card content-narrow">
          <div className="auth-mono">{error}</div>
        </div>
      )}

      {t && (
        <>
          <div className="content-narrow">
            <div className="auth-card">
              <div className="page-header">
                <div>
                  <h1 className="auth-title" style={{ marginBottom: ".25rem" }}>
                    {t.name}
                  </h1>
                  <div className="auth-mono">{t.course_name}</div>
                </div>
                <button className="auth-btn secondary" onClick={() => void load(t.id)} disabled={!!loading}>
                  Refresh
                </button>
              </div>
              <div className="auth-row" style={{ justifyContent: "space-between", marginTop: ".75rem" }}>
                <div className="auth-mono">Groups: {t.groups.length}</div>
                <div className="auth-row">
                  <button className="auth-btn primary" onClick={() => void startMyGroup()} disabled={!!loading}>
                    Start my group
                  </button>
                  <Link className="auth-btn secondary" to="/round/start">
                    Start a solo round
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="auth-card">
            <div style={{ fontWeight: 800, marginBottom: ".5rem" }}>Leaderboard</div>
            {!t.leaderboard.length ? (
              <div className="auth-mono">No scores yet.</div>
            ) : (
              <div className="table-scroll">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "48px 1.6fr 90px 90px 90px 90px 120px",
                    gap: ".5rem",
                    alignItems: "center",
                  }}
                >
                  <div className="auth-mono">#</div>
                  <div className="auth-mono">Player</div>
                  <div className="auth-mono">To par</div>
                  <div className="auth-mono">Strokes</div>
                  <div className="auth-mono">Holes</div>
                  <div className="auth-mono">On</div>
                  <div className="auth-mono">Group</div>

                  {t.leaderboard.map((e, idx) => (
                    <div key={`${e.player_id}-${e.group_round_id}`} style={{ display: "contents" }}>
                      <div className="auth-mono">{idx + 1}</div>
                      <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {e.player_name}
                      </div>
                      <div className="auth-mono">{e.score_to_par > 0 ? `+${e.score_to_par}` : e.score_to_par}</div>
                      <div className="auth-mono">{e.strokes}</div>
                      <div className="auth-mono">{e.holes_completed}</div>
                      <div className="auth-mono">{e.current_hole ?? "—"}</div>
                      <Link className="auth-btn secondary" to={`/rounds/${e.group_round_id}`}>
                        Scorecard
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="auth-card">
            <div style={{ fontWeight: 800, marginBottom: ".5rem" }}>Groups</div>
            {!t.groups.length ? (
              <div className="auth-mono">No groups yet.</div>
            ) : (
              <div className="stack">
                {t.groups.map((g) => (
                  <div key={g.round_id} className="auth-card" style={{ padding: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>Round #{g.round_id}</div>
                        <div className="auth-mono">Players: {g.players_count} · Leader: {g.owner_id}</div>
                      </div>
                      <Link className="auth-btn secondary" to={`/rounds/${g.round_id}`}>
                        Open
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
