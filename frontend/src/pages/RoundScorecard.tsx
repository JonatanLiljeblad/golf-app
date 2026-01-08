import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useApi } from "../api/useApi";
import type { Round } from "../api/types";

type ApiError = { status: number; body: unknown };

export default function RoundScorecard() {
  const { roundId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, loginWithRedirect, user } = useAuth0();
  const { request } = useApi();

  const viewerId = user?.sub ?? "";

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

  const [inviteId, setInviteId] = useState("");

  const isOwner = !!round && viewerId && round.owner_id === viewerId;

  async function submitScore(holeNumber: number, playerId: string, strokes: number) {
    if (!round || round.completed_at) return;
    setError(null);
    try {
      await request(`/api/v1/rounds/${round.id}/scores`, {
        method: "POST",
        body: JSON.stringify({ hole_number: holeNumber, strokes, player_id: playerId }),
      });
      await load(round.id);
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to submit score (${err.status}).`);
    }
  }

  async function addPlayer() {
    if (!round || !isOwner || round.completed_at) return;
    const pid = inviteId.trim();
    if (!pid) return;

    setError(null);
    try {
      await request(`/api/v1/rounds/${round.id}/participants`, {
        method: "POST",
        body: JSON.stringify({ player_ids: [pid] }),
      });
      setInviteId("");
      await load(round.id);
    } catch (e) {
      const err = e as ApiError;
      const detail = err.body && typeof err.body === "object" && "detail" in err.body ? (err.body as { detail?: unknown }).detail : null;
      const msg = detail != null ? String(detail) : null;
      setError(msg ? `${msg} (${err.status}).` : `Failed to add player (${err.status}).`);
    }
  }

  async function deleteRound() {
    if (!round || !isOwner || round.completed_at) return;
    setError(null);
    try {
      await request(`/api/v1/rounds/${round.id}`, { method: "DELETE" });
      navigate("/rounds", { replace: true });
    } catch (e) {
      const err = e as ApiError;
      const detail = err.body && typeof err.body === "object" && "detail" in err.body ? (err.body as { detail?: unknown }).detail : null;
      const msg = detail != null ? String(detail) : null;
      setError(msg ? `${msg} (${err.status}).` : `Failed to delete round (${err.status}).`);
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
                  {round.completed_at ? "Completed" : "In progress"} · Your strokes: {round.total_strokes ?? "—"}
                </div>
              </div>
              <button className="auth-btn secondary" onClick={() => void load(round.id)}>
                Refresh
              </button>
            </div>
          </div>

          <div className="auth-card" style={{ margin: 0, maxWidth: "none" }}>
            <div style={{ display: "grid", gap: ".75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
                <div className="auth-mono">Players: {round.player_ids.length} / 4</div>
                {isOwner && !round.completed_at && (
                  <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                    <input
                      placeholder="Invite player (email or username)"
                      value={inviteId}
                      onChange={(e) => setInviteId(e.target.value)}
                      style={{ width: 260 }}
                    />
                    <button className="auth-btn secondary" onClick={() => void addPlayer()} disabled={!inviteId.trim()}>
                      Add
                    </button>
                  </div>
                )}
              </div>

              {isOwner && !round.completed_at && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="auth-btn secondary" onClick={() => void deleteRound()}>
                    Delete round
                  </button>
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `120px 80px repeat(${round.player_ids.length}, 1fr)`,
                  gap: ".5rem",
                  alignItems: "center",
                }}
              >
                <div className="auth-mono">Hole</div>
                <div className="auth-mono">Par</div>
                {round.player_ids.map((pid) => {
                  const meta = round.players?.find((p) => p.external_id === pid);
                  const label =
                    pid === viewerId
                      ? "You"
                      : meta?.username ?? meta?.name ?? meta?.email ?? pid;
                  return (
                    <div key={pid} className="auth-mono" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {label}
                    </div>
                  );
                })}

                {round.holes.map((h) => (
                  <div key={h.number} style={{ display: "contents" }}>
                    <div className="auth-mono">{h.number}</div>
                    <div className="auth-mono">{h.par}</div>
                    {round.player_ids.map((pid) => {
                      const canEdit = !round.completed_at && (pid === viewerId || isOwner);
                      return (
                        <input
                          key={`${h.number}-${pid}`}
                          type="number"
                          min={1}
                          max={30}
                          defaultValue={h.strokes[pid] ?? ""}
                          placeholder="strokes"
                          disabled={!canEdit}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v) && v > 0) void submitScore(h.number, pid, v);
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
