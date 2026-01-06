import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useApi } from "../api/useApi";
import type { Round } from "../api/types";

type ApiError = { status: number; body: unknown };

export default function RoundScorecard() {
  const { roundId } = useParams();
  const { isAuthenticated, loginWithRedirect } = useAuth0();
  const { request } = useApi();

  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(id: number) {
    setError(null);
    setLoading("Loading round…");
    try {
      const data = await request<Round>(`/api/v1/rounds/${id}`);
      setRound(data);
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to load round (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  async function submitScore(holeNumber: number, strokes: number) {
    if (!round || round.completed_at) return;
    setError(null);
    try {
      await request(`/api/v1/rounds/${round.id}/scores`, {
        method: "POST",
        body: JSON.stringify({ hole_number: holeNumber, strokes }),
      });
      await load(round.id);
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to submit score (${err.status}).`);
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return;
    const id = Number(roundId);
    if (!Number.isFinite(id) || id <= 0) {
      setError("Invalid round id.");
      return;
    }
    void load(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, roundId]);

  if (!isAuthenticated) {
    return (
      <div className="auth-card">
        <h1 className="auth-title">Round</h1>
        <p className="auth-subtitle">Log in to view your scorecard.</p>
        <button className="auth-btn primary" onClick={() => loginWithRedirect()}>
          Log in
        </button>
      </div>
    );
  }

  if (loading && !round) return <div className="auth-card">Loading…</div>;

  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: 720 }}>
      {error && (
        <div className="auth-card">
          <div className="auth-mono">{error}</div>
        </div>
      )}

      {round && (
        <>
          <div className="auth-card" style={{ margin: 0, maxWidth: "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
              <div>
                <div style={{ fontWeight: 800 }}>
                  {round.course_name} · Round #{round.id}
                </div>
                <div className="auth-mono">Par {round.total_par}</div>
                <div className="auth-mono">
                  {round.completed_at ? "Completed" : "In progress"} · Total strokes: {round.total_strokes ?? "—"}
                </div>
              </div>
              <button className="auth-btn secondary" onClick={() => void load(round.id)}>
                Refresh
              </button>
            </div>
          </div>

          <div className="auth-card" style={{ margin: 0, maxWidth: "none" }}>
            <div style={{ display: "grid", gap: ".5rem" }}>
              {round.holes.map((h) => (
                <div
                  key={h.number}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: ".75rem",
                    alignItems: "center",
                  }}
                >
                  <div className="auth-mono">Hole {h.number} · Par {h.par}</div>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    defaultValue={h.strokes ?? ""}
                    placeholder="strokes"
                    disabled={!!round.completed_at}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v > 0) void submitScore(h.number, v);
                    }}
                    style={{ width: 120 }}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
