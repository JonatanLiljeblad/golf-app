import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";

import { useApi } from "../api/useApi";
import type { Tournament } from "../api/types";

type ApiError = { status: number; body: unknown };

export default function TournamentPage() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, loginWithRedirect, user } = useAuth0();
  const { request } = useApi();

  const viewerId = user?.sub ?? "";

  const [t, setT] = useState<Tournament | null>(null);
  const [inviteRecipient, setInviteRecipient] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
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

  async function startGroup(groupId: number) {
    if (!t) return;
    setError(null);
    setMsg(null);
    setLoading("Starting group…");
    try {
      const res = await request<{ round_id: number }>(`/api/v1/tournaments/${t.id}/rounds`, {
        method: "POST",
        body: JSON.stringify({ group_id: groupId }),
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

  async function startMyGroup() {
    if (!t) return;
    if (t.my_group_round_id) {
      navigate(`/rounds/${t.my_group_round_id}`);
      return;
    }

    const slot = t.groups.find((g) => g.round_id == null);
    if (!slot) {
      setError("No available group slots.");
      return;
    }

    await startGroup(slot.id);
  }

  async function joinGroup(roundId: number) {
    if (!t) return;
    setError(null);
    setMsg(null);
    setLoading("Joining group…");
    try {
      const res = await request<{ round_id: number }>(
        `/api/v1/tournaments/${t.id}/rounds/${roundId}/join`,
        { method: "POST" }
      );
      navigate(`/rounds/${res.round_id}`);
    } catch (e) {
      const err = e as ApiError;
      const detail =
        err.body && typeof err.body === "object" && "detail" in err.body
          ? (err.body as { detail?: unknown }).detail
          : null;
      const msg = detail != null ? String(detail) : null;
      setError(msg ? `${msg} (${err.status}).` : `Failed to join group (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  async function pauseTournament() {
    if (!t) return;
    if (t.completed_at || t.paused_at) return;

    const message = window.prompt("Pause message (optional)", t.pause_message ?? "") ?? "";

    setError(null);
    setMsg(null);
    setLoading("Pausing tournament…");
    try {
      const updated = await request<Tournament>(`/api/v1/tournaments/${t.id}/pause`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      setT(updated);
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to pause tournament (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  async function resumeTournament() {
    if (!t) return;
    if (t.completed_at || !t.paused_at) return;

    setError(null);
    setMsg(null);
    setLoading("Resuming tournament…");
    try {
      const updated = await request<Tournament>(`/api/v1/tournaments/${t.id}/resume`, { method: "POST" });
      setT(updated);
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to resume tournament (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  async function finishTournament() {
    if (!t) return;
    if (t.completed_at) return;

    const hasActive = (t.active_groups_count ?? 0) > 0;
    const ok = window.confirm(
      hasActive
        ? `Finish tournament? There are ${t.active_groups_count} group(s) still playing.`
        : "Finish tournament?"
    );
    if (!ok) return;

    setError(null);
    setMsg(null);
    setLoading("Finishing tournament…");
    try {
      const updated = await request<Tournament>(`/api/v1/tournaments/${t.id}/finish`, { method: "POST" });
      setT(updated);
      setMsg("Tournament finished.");
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to finish tournament (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  async function deleteTournament() {
    if (!t) return;
    const ok = window.confirm(
      "Delete tournament? This will remove invites/members. Existing rounds will remain but no longer be linked to the tournament."
    );
    if (!ok) return;

    setError(null);
    setMsg(null);
    setLoading("Deleting tournament…");
    try {
      await request(`/api/v1/tournaments/${t.id}`, { method: "DELETE" });
      navigate("/tournaments");
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409) {
        const force = window.confirm(
          "There are players mid-round in this tournament. Delete anyway?"
        );
        if (!force) return;
        try {
          await request(`/api/v1/tournaments/${t.id}?force=true`, { method: "DELETE" });
          navigate("/tournaments");
          return;
        } catch (e2) {
          const err2 = e2 as ApiError;
          setError(`Failed to delete tournament (${err2.status}).`);
          return;
        }
      }
      setError(`Failed to delete tournament (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  async function sendInvite() {
    if (!t) return;
    const recipient = inviteRecipient.trim();
    if (!recipient) return;

    setError(null);
    setMsg(null);
    setLoading("Sending invite…");
    try {
      await request(`/api/v1/tournaments/${t.id}/invites`, {
        method: "POST",
        body: JSON.stringify({ recipient }),
      });
      setInviteRecipient("");
      setMsg("Invite sent.");
    } catch (e) {
      const err = e as ApiError;
      const detail =
        err.body && typeof err.body === "object" && "detail" in err.body
          ? (err.body as { detail?: unknown }).detail
          : null;
      const msg = detail != null ? String(detail) : null;
      setError(msg ? `${msg} (${err.status}).` : `Failed to send invite (${err.status}).`);
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
      {msg && (
        <div className="auth-card content-narrow">
          <div className="auth-mono">{msg}</div>
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
                  <div className="auth-mono">
                    {t.course_name} · {t.is_public ? "Public" : "Private"}
                    {t.completed_at ? " · Finished" : ""}
                    {t.paused_at && !t.completed_at ? " · Paused" : ""}
                  </div>
                  <div className="auth-mono">Host: {t.owner_name ?? t.owner_id}</div>
                </div>
                <button className="auth-btn secondary" onClick={() => void load(t.id)} disabled={!!loading}>
                  Refresh
                </button>
              </div>

              {t.paused_at && !t.completed_at && (
                <div className="card-inset" style={{ marginTop: ".75rem" }}>
                  <div style={{ fontWeight: 800 }}>Tournament paused</div>
                  <div className="auth-mono" style={{ marginTop: ".25rem" }}>
                    {t.pause_message || "Scores are temporarily locked."}
                  </div>
                </div>
              )}

              <div className="auth-row" style={{ justifyContent: "space-between", marginTop: ".75rem" }}>
                <div className="auth-mono">Groups: {t.groups.length}</div>
                {!t.completed_at && (
                  <div className="auth-row">
                    <button
                      className="auth-btn primary"
                      onClick={() => void startMyGroup()}
                      disabled={!!loading || (!!t.paused_at && !t.completed_at)}
                    >
                      {t.my_group_round_id ? "Go to my group" : "Start my group"}
                    </button>
                  </div>
                )}
              </div>

              {t.owner_id === viewerId && (
                <div className="auth-row" style={{ marginTop: ".75rem" }}>
                  {!t.completed_at && (
                    <>
                      <button
                        className="auth-btn secondary"
                        onClick={() => void pauseTournament()}
                        disabled={!!loading || !!t.paused_at}
                      >
                        Pause tournament
                      </button>
                      <button
                        className="auth-btn secondary"
                        onClick={() => void resumeTournament()}
                        disabled={!!loading || !t.paused_at}
                      >
                        Resume tournament
                      </button>
                      <button className="auth-btn secondary" onClick={() => void finishTournament()} disabled={!!loading}>
                        Finish tournament
                      </button>
                    </>
                  )}
                  <button className="auth-btn secondary" onClick={() => void deleteTournament()} disabled={!!loading}>
                    Delete tournament
                  </button>
                </div>
              )}
            </div>
          </div>

          {!t.completed_at && !t.is_public && t.owner_id === viewerId && (
            <div className="content-narrow">
              <div className="auth-card" style={{ display: "grid", gap: ".5rem" }}>
                <div style={{ fontWeight: 800 }}>Invite players</div>
                <div className="auth-mono">Private tournaments are invite-only.</div>
                <input
                  value={inviteRecipient}
                  onChange={(e) => setInviteRecipient(e.target.value)}
                  placeholder="Invite by email / username / Auth0 id"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void sendInvite();
                  }}
                />
                <button
                  className="auth-btn primary"
                  onClick={() => void sendInvite()}
                  disabled={!inviteRecipient.trim() || !!loading}
                >
                  Send invite
                </button>
              </div>
            </div>
          )}

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
                      <div className="auth-mono">
                        {e.score_to_par === 0 ? "E" : e.score_to_par > 0 ? `+${e.score_to_par}` : e.score_to_par}
                      </div>
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

          {!t.completed_at && (
            <div className="auth-card">
              <div style={{ fontWeight: 800, marginBottom: ".5rem" }}>Groups</div>
              {!t.groups.length ? (
                <div className="auth-mono">No groups yet.</div>
              ) : (
                <div className="stack">
                  {t.groups.map((g) => {
                    const isMine = !!t.my_group_round_id && g.round_id === t.my_group_round_id;
                    const canJoinOthers = !t.my_group_round_id;

                    return (
                      <div
                        key={g.id}
                        className="card-inset"
                        style={
                          isMine
                            ? {
                                borderColor: "rgba(99, 93, 255, 0.55)",
                                background: "rgba(99, 93, 255, 0.08)",
                              }
                            : undefined
                        }
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "1rem",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 800 }}>
                              {g.name}
                              {isMine ? " · Your group" : ""}
                            </div>
                            {g.round_id == null ? (
                              <div className="auth-mono">Not started</div>
                            ) : (
                              <div className="auth-mono" style={{ wordBreak: "break-word" }}>
                                Players: {g.players_count} · Leader: {g.owner_name ?? g.owner_id}
                              </div>
                            )}
                          </div>
                          <div className="auth-row" style={{ flexShrink: 0 }}>
                            {g.round_id == null ? (
                              <button
                                className="auth-btn primary"
                                onClick={() => void startGroup(g.id)}
                                disabled={!!loading || (!!t.paused_at && !t.completed_at)}
                              >
                                Start
                              </button>
                            ) : (
                              <>
                                {canJoinOthers && g.players_count < 4 && (
                                  <button
                                    className="auth-btn primary"
                                    onClick={() => void joinGroup(g.round_id!)}
                                    disabled={!!loading || (!!t.paused_at && !t.completed_at)}
                                  >
                                    Join
                                  </button>
                                )}
                                <Link
                                  className={isMine ? "auth-btn primary" : "auth-btn secondary"}
                                  to={`/rounds/${g.round_id!}`}
                                >
                                  Open
                                </Link>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
