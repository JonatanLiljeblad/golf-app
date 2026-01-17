import { useEffect, useMemo, useState } from "react";
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
  const tournamentLocked = !!round?.tournament_completed_at || !!round?.tournament_paused_at;

  const playerLabel = useMemo(() => {
    const map: Record<string, string> = {};
    if (!round) return map;
    for (const pid of round.player_ids) {
      const meta = round.players?.find((p) => p.external_id === pid);
      map[pid] = pid === viewerId ? "You" : meta?.username ?? meta?.name ?? meta?.email ?? pid;
    }
    return map;
  }, [round, viewerId]);

  const [activePlayerId, setActivePlayerId] = useState<string>(viewerId);
  const [activeHoleNumber, setActiveHoleNumber] = useState<number>(1);
  const [padPage, setPadPage] = useState<1 | 2>(1);

  const [draftStrokes, setDraftStrokes] = useState<number | null>(null);
  const [draftPutts, setDraftPutts] = useState<number | null>(null);
  const [draftFairway, setDraftFairway] = useState<string | null>(null);
  const [draftGir, setDraftGir] = useState<string | null>(null);

  const holes = round?.holes ?? [];
  const front9 = holes.filter((h) => h.number <= 9);
  const back9 = holes.filter((h) => h.number >= 10);
  const activeHole = holes.find((h) => h.number === activeHoleNumber) ?? holes[0] ?? null;

  const statsEnabled = !!round?.stats_enabled;

  const canEdit = (pid: string) => !round?.completed_at && !tournamentLocked && (pid === viewerId || isOwner);
  const isParticipant = !!round && !!viewerId && round.player_ids.includes(viewerId);
  const readOnlyTournamentGroup = !!round?.tournament_id && !isOwner && !isParticipant;

  const activeSavedStrokes = activeHole ? (activeHole.strokes?.[activePlayerId] ?? null) : null;
  const activeSavedPutts = activeHole ? (activeHole.putts?.[activePlayerId] ?? null) : null;
  const activeSavedFairway = activeHole ? (activeHole.fairway?.[activePlayerId] ?? null) : null;
  const activeSavedGir = activeHole ? (activeHole.gir?.[activePlayerId] ?? null) : null;
  const activeSavedComplete =
    activeSavedStrokes != null && (!statsEnabled || (activeSavedPutts != null && !!activeSavedFairway && !!activeSavedGir));
  const blockHoleAdvance = statsEnabled && canEdit(activePlayerId) && !activeSavedComplete;

  const [viewMode, setViewMode] = useState<"hole" | "scorecard">(readOnlyTournamentGroup ? "scorecard" : "hole");

  useEffect(() => {
    if (readOnlyTournamentGroup) setViewMode("scorecard");
  }, [readOnlyTournamentGroup]);

  useEffect(() => {
    if (!activeHole) return;
    const pid = activePlayerId;
    setDraftStrokes(activeHole.strokes?.[pid] ?? null);
    setDraftPutts(activeHole.putts?.[pid] ?? null);
    setDraftFairway(activeHole.fairway?.[pid] ?? null);
    setDraftGir(activeHole.gir?.[pid] ?? null);
  }, [round?.id, activeHoleNumber, activePlayerId, statsEnabled, activeHole]);

  function sumPar(hs: typeof holes) {
    return hs.reduce((acc, h) => acc + h.par, 0);
  }

  function sumStrokes(pid: string, hs: typeof holes) {
    let total = 0;
    let any = false;
    for (const h of hs) {
      const v = h.strokes?.[pid] ?? null;
      if (v != null) {
        total += v;
        any = true;
      }
    }
    return any ? total : null;
  }

  function sumPutts(pid: string, hs: typeof holes) {
    let total = 0;
    let any = false;
    for (const h of hs) {
      const v = h.putts?.[pid] ?? null;
      if (v != null) {
        total += v;
        any = true;
      }
    }
    return any ? total : null;
  }

  function countDir(pid: string, hs: typeof holes, field: "fairway" | "gir", target: string) {
    let hit = 0;
    let total = 0;
    for (const h of hs) {
      const v = (field === "fairway" ? h.fairway?.[pid] : h.gir?.[pid]) ?? null;
      if (v != null) {
        total += 1;
        if (v === target) hit += 1;
      }
    }
    return { hit, total };
  }

  function dirLabel(v: string | null | undefined) {
    if (!v) return "—";
    switch (v) {
      case "hit":
        return "Hit";
      case "left":
        return "L";
      case "right":
        return "R";
      case "short":
        return "S";
      case "long":
        return "Long";
      default:
        return v;
    }
  }

  async function submitScore(
    holeNumber: number,
    playerId: string,
    strokes: number,
    extra?: { putts?: number | null; fairway?: string | null; gir?: string | null }
  ) {
    if (!round || round.completed_at || tournamentLocked || readOnlyTournamentGroup) return;
    setError(null);
    try {
      await request(`/api/v1/rounds/${round.id}/scores`, {
        method: "POST",
        body: JSON.stringify({ hole_number: holeNumber, strokes, player_id: playerId, ...(extra ?? {}) }),
      });
      await load(round.id);

      // Friendly UX: move to next hole after entering a score.
      const idx = holes.findIndex((h) => h.number === holeNumber);
      const next = idx >= 0 ? holes[idx + 1] : null;
      if (next) setActiveHoleNumber(next.number);
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

  useEffect(() => {
    if (!round) return;

    // Keep selected player valid.
    if (!round.player_ids.includes(activePlayerId)) {
      setActivePlayerId(viewerId && round.player_ids.includes(viewerId) ? viewerId : round.player_ids[0] ?? "");
    }

    // Start on the first hole without a score for the active player (fallback to first hole).
    const pid = (activePlayerId && round.player_ids.includes(activePlayerId))
      ? activePlayerId
      : (viewerId && round.player_ids.includes(viewerId) ? viewerId : round.player_ids[0]);
    const firstOpen = pid
      ? round.holes.find((h) => (h.strokes?.[pid] ?? null) == null)
      : null;
    const preferred = firstOpen?.number ?? round.holes[0]?.number ?? 1;
    if (!round.holes.some((h) => h.number === activeHoleNumber)) setActiveHoleNumber(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id]);

  if (!isAuthenticated) {
    return (
      <div className="auth-card content-narrow">
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
    <div className="page">
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
                  {statsEnabled ? " · Stats: On" : " · Stats: Off"}
                </div>
              </div>
              <button className="auth-btn secondary" onClick={() => void load(round.id)}>
                Refresh
              </button>
            </div>
          </div>

          {(round.tournament_completed_at || round.tournament_paused_at) && (
            <div className="auth-card" style={{ margin: 0, maxWidth: "none" }}>
              <div style={{ fontWeight: 800 }}>
                {round.tournament_completed_at ? "Tournament finished" : "Tournament paused"}
              </div>
              <div className="auth-mono" style={{ marginTop: ".25rem" }}>
                {round.tournament_completed_at
                  ? "Scores are locked."
                  : round.tournament_pause_message || "Scores are temporarily locked."}
              </div>
            </div>
          )}

          {round.completed_at && statsEnabled && (
            <div className="auth-card" style={{ margin: 0, maxWidth: "none" }}>
              <div style={{ fontWeight: 800 }}>Statistics</div>
              <div className="scorecard-hole__summary" style={{ marginTop: ".75rem" }}>
                {round.player_ids.map((pid) => {
                  const putts = sumPutts(pid, holes);
                  const fir = countDir(pid, holes, "fairway", "hit");
                  const gir = countDir(pid, holes, "gir", "hit");
                  return (
                    <div key={`stats-${pid}`} className="scorecard-hole__summaryItem">
                      <div className="auth-mono" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                        {playerLabel[pid] ?? pid}
                      </div>
                      <div className="auth-mono" style={{ marginTop: ".25rem" }}>
                        Putts: {putts ?? "—"}
                      </div>
                      <div className="auth-mono">
                        FIR: {fir.total ? `${Math.round((fir.hit / fir.total) * 100)}%` : "—"}
                      </div>
                      <div className="auth-mono">
                        GIR: {gir.total ? `${Math.round((gir.hit / gir.total) * 100)}%` : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="auth-card" style={{ margin: 0, maxWidth: "none" }}>
            <div style={{ display: "grid", gap: ".75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
                <div className="auth-mono">Players: {round.player_ids.length} / 4</div>
                {isOwner && !round.completed_at && (
                  <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                    <input
                      placeholder="Invite player (email, username, or Auth0 id)"
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

              {!readOnlyTournamentGroup && (
                <div className="auth-row" style={{ justifyContent: "flex-end" }}>
                  <button
                    className={viewMode === "hole" ? "auth-btn primary" : "auth-btn secondary"}
                    onClick={() => setViewMode("hole")}
                    disabled={!!round.completed_at || tournamentLocked}
                  >
                    Input
                  </button>
                  <button
                    className={viewMode === "scorecard" ? "auth-btn primary" : "auth-btn secondary"}
                    onClick={() => setViewMode("scorecard")}
                  >
                    Scorecard
                  </button>
                </div>
              )}

              {(viewMode === "scorecard" || readOnlyTournamentGroup) && (
                <div style={{ display: "grid", gap: ".75rem" }}>
                  <div className="table-scroll">
                    <table className="scorecard-table">
                      <thead>
                        <tr>
                          <th className="auth-mono" style={{ textAlign: "left" }}>Player</th>
                          {front9.map((h) => (
                            <th key={`h${h.number}`}>
                              <button className="scorecard-holelink" type="button" onClick={() => setActiveHoleNumber(h.number)}>
                                {h.number}
                              </button>
                            </th>
                          ))}
                          <th className="auth-mono">Out</th>
                          {back9.map((h) => (
                            <th key={`h${h.number}`}>
                              <button className="scorecard-holelink" type="button" onClick={() => setActiveHoleNumber(h.number)}>
                                {h.number}
                              </button>
                            </th>
                          ))}
                          <th className="auth-mono">In</th>
                          <th className="auth-mono">Tot</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="auth-mono">Par</td>
                          {front9.map((h) => (
                            <td key={`par${h.number}`} className="auth-mono">{h.par}</td>
                          ))}
                          <td className="auth-mono">{front9.length ? sumPar(front9) : "—"}</td>
                          {back9.map((h) => (
                            <td key={`par${h.number}`} className="auth-mono">{h.par}</td>
                          ))}
                          <td className="auth-mono">{back9.length ? sumPar(back9) : "—"}</td>
                          <td className="auth-mono">{holes.length ? sumPar(holes) : "—"}</td>
                        </tr>

                        {round.player_ids.map((pid) => {
                          const out = sumStrokes(pid, front9);
                          const inn = sumStrokes(pid, back9);
                          const tot = sumStrokes(pid, holes);
                          return (
                            <tr key={`p-${pid}`}>
                              <td style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{playerLabel[pid] ?? pid}</td>
                              {front9.map((h) => (
                                <td
                                  key={`${pid}-${h.number}`}
                                  title={
                                    statsEnabled
                                      ? `P:${h.putts?.[pid] ?? "—"} FIR:${dirLabel(h.fairway?.[pid])} GIR:${dirLabel(h.gir?.[pid])}`
                                      : undefined
                                  }
                                >
                                  {h.strokes?.[pid] ?? ""}
                                </td>
                              ))}
                              <td className="auth-mono">{out ?? "—"}</td>
                              {back9.map((h) => (
                                <td
                                  key={`${pid}-${h.number}`}
                                  title={
                                    statsEnabled
                                      ? `P:${h.putts?.[pid] ?? "—"} FIR:${dirLabel(h.fairway?.[pid])} GIR:${dirLabel(h.gir?.[pid])}`
                                      : undefined
                                  }
                                >
                                  {h.strokes?.[pid] ?? ""}
                                </td>
                              ))}
                              <td className="auth-mono">{inn ?? "—"}</td>
                              <td className="auth-mono">{tot ?? "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {activeHole && (
                    <div className="scorecard-hole" style={{ display: "grid", gap: ".75rem" }}>
                      <div className="scorecard-hole__header">
                        <div>
                          <div style={{ fontWeight: 900 }}>Hole {activeHole.number} / {holes.length}</div>
                          <div className="auth-mono">
                            Par {activeHole.par}
                            {activeHole.distance != null ? ` · ${activeHole.distance}m` : ""}
                            {activeHole.hcp != null ? ` · HCP ${activeHole.hcp}` : ""}
                          </div>
                        </div>
                        <div className="scorecard-hole__nav">
                          <button
                            className="auth-btn secondary"
                            onClick={() => {
                              const idx = holes.findIndex((h) => h.number === activeHole.number);
                              const prev = idx > 0 ? holes[idx - 1] : null;
                              if (prev) setActiveHoleNumber(prev.number);
                            }}
                            disabled={holes.findIndex((h) => h.number === activeHole.number) <= 0}
                          >
                            Prev
                          </button>
                          <button
                            className="auth-btn secondary"
                            onClick={() => {
                              const idx = holes.findIndex((h) => h.number === activeHole.number);
                              const next = idx >= 0 ? holes[idx + 1] : null;
                              if (next) setActiveHoleNumber(next.number);
                            }}
                            disabled={holes.findIndex((h) => h.number === activeHole.number) >= holes.length - 1}
                          >
                            Next
                          </button>
                          {!readOnlyTournamentGroup && (
                            <button className="auth-btn primary" onClick={() => setViewMode("hole")}>Input</button>
                          )}
                        </div>
                      </div>

                      <div className="scorecard-hole__summary">
                        {round.player_ids.map((pid) => (
                          <div key={`sum-${pid}`} className="scorecard-hole__summaryItem">
                            <div className="auth-mono" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                              {playerLabel[pid] ?? pid}
                            </div>
                            <div style={{ fontWeight: 900, fontSize: "1.15rem" }}>
                              {activeHole.strokes?.[pid] ?? "—"}
                            </div>
                            {statsEnabled && (
                              <div className="auth-mono" style={{ marginTop: ".25rem" }}>
                                P {activeHole.putts?.[pid] ?? "—"} · FIR {dirLabel(activeHole.fairway?.[pid])} · GIR {dirLabel(activeHole.gir?.[pid])}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {viewMode === "hole" && !readOnlyTournamentGroup && activeHole && (
                <div className="scorecard-hole" style={{ display: "grid", gap: ".75rem" }}>
                  <div className="scorecard-hole__header">
                    <div>
                      <div style={{ fontWeight: 900 }}>Hole {activeHole.number} / {holes.length}</div>
                      <div className="auth-mono">
                        Par {activeHole.par}
                        {activeHole.distance != null ? ` · ${activeHole.distance}m` : ""}
                        {activeHole.hcp != null ? ` · HCP ${activeHole.hcp}` : ""}
                      </div>
                    </div>
                    <div className="scorecard-hole__nav">
                      <button
                        className="auth-btn secondary"
                        onClick={() => {
                          const idx = holes.findIndex((h) => h.number === activeHole.number);
                          const prev = idx > 0 ? holes[idx - 1] : null;
                          if (prev) setActiveHoleNumber(prev.number);
                        }}
                        disabled={holes.findIndex((h) => h.number === activeHole.number) <= 0}
                      >
                        Prev
                      </button>
                      <button
                        className="auth-btn secondary"
                        onClick={() => {
                          const idx = holes.findIndex((h) => h.number === activeHole.number);
                          const next = idx >= 0 ? holes[idx + 1] : null;
                          if (next) setActiveHoleNumber(next.number);
                        }}
                        disabled={holes.findIndex((h) => h.number === activeHole.number) >= holes.length - 1 || blockHoleAdvance}
                      >
                        Next
                      </button>
                    </div>
                  </div>

                  <div className="scorecard-players">
                    {round.player_ids.map((pid) => (
                      <button
                        key={pid}
                        className={activePlayerId === pid ? "auth-btn primary" : "auth-btn secondary"}
                        onClick={() => setActivePlayerId(pid)}
                        title={!canEdit(pid) ? "Only the round owner can enter scores for others" : undefined}
                      >
                        {playerLabel[pid] ?? pid}
                      </button>
                    ))}
                  </div>

                  <div className="scorecard-hole__summary">
                    {round.player_ids.map((pid) => (
                      <div key={`sum-${pid}`} className="scorecard-hole__summaryItem">
                        <div className="auth-mono" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                          {playerLabel[pid] ?? pid}
                        </div>
                        <div style={{ fontWeight: 900, fontSize: "1.15rem" }}>
                          {activeHole.strokes?.[pid] ?? "—"}
                        </div>
                        {statsEnabled && (
                          <div className="auth-mono" style={{ marginTop: ".25rem" }}>
                            P {activeHole.putts?.[pid] ?? "—"} · FIR {dirLabel(activeHole.fairway?.[pid])} · GIR {dirLabel(activeHole.gir?.[pid])}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="scorepad">
                    <div className="auth-mono" style={{ marginBottom: ".25rem" }}>
                      Enter strokes for <span style={{ fontWeight: 900 }}>{playerLabel[activePlayerId] ?? activePlayerId}</span>
                    </div>

                    <div className="scorepad-grid">
                      {(padPage === 1 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [10, 11, 12, 13, 14, 15, 16, 17, 18]).map(
                        (n) => (
                          <button
                            key={n}
                            type="button"
                            className="scorepad-btn"
                            style={draftStrokes === n ? { background: "rgba(255, 255, 255, 0.12)", borderColor: "rgba(255, 255, 255, 0.35)" } : undefined}
                            disabled={!canEdit(activePlayerId)}
                            onClick={() => {
                              if (statsEnabled) setDraftStrokes(n);
                              else void submitScore(activeHole.number, activePlayerId, n);
                            }}
                          >
                            {n}
                          </button>
                        )
                      )}
                      <button
                        type="button"
                        className="scorepad-btn secondary"
                        onClick={() => setPadPage(padPage === 1 ? 2 : 1)}
                      >
                        {padPage === 1 ? ">" : "<"}
                      </button>
                    </div>

                    {statsEnabled && (
                      <div style={{ display: "grid", gap: ".75rem", marginTop: ".75rem" }}>
                        <div>
                          <div className="auth-mono" style={{ marginBottom: ".35rem" }}>Putts</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: ".6rem" }}>
                            {[0, 1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={`p-${n}`}
                                type="button"
                                className="scorepad-btn"
                                style={draftPutts === n ? { background: "rgba(255, 255, 255, 0.12)", borderColor: "rgba(255, 255, 255, 0.35)" } : undefined}
                                disabled={!canEdit(activePlayerId)}
                                onClick={() => setDraftPutts(n)}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="auth-mono" style={{ marginBottom: ".35rem" }}>Fairway</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: ".6rem" }}>
                            {["left", "hit", "right", "short"].map((v) => (
                              <button
                                key={`f-${v}`}
                                type="button"
                                className="scorepad-btn"
                                style={draftFairway === v ? { background: "rgba(255, 255, 255, 0.12)", borderColor: "rgba(255, 255, 255, 0.35)" } : undefined}
                                disabled={!canEdit(activePlayerId)}
                                onClick={() => setDraftFairway(v)}
                              >
                                {v === "hit" ? "Hit" : v}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="auth-mono" style={{ marginBottom: ".35rem" }}>GIR</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: ".6rem" }}>
                            {["left", "hit", "right", "short", "long"].map((v) => (
                              <button
                                key={`g-${v}`}
                                type="button"
                                className="scorepad-btn"
                                style={draftGir === v ? { background: "rgba(255, 255, 255, 0.12)", borderColor: "rgba(255, 255, 255, 0.35)" } : undefined}
                                disabled={!canEdit(activePlayerId)}
                                onClick={() => setDraftGir(v)}
                              >
                                {v === "hit" ? "Hit" : v}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          className="auth-btn primary"
                          disabled={
                            !canEdit(activePlayerId) ||
                            draftStrokes == null ||
                            draftPutts == null ||
                            !draftFairway ||
                            !draftGir
                          }
                          onClick={() =>
                            draftStrokes != null
                              ? void submitScore(activeHole.number, activePlayerId, draftStrokes, {
                                  putts: draftPutts,
                                  fairway: draftFairway,
                                  gir: draftGir,
                                })
                              : undefined
                          }
                        >
                          Save & Next
                        </button>

                        <div className="auth-mono">
                          Tip: pick strokes + stats, then Save (auto-advances to the next hole).
                        </div>
                      </div>
                    )}

                    {!statsEnabled && (
                      <div className="auth-mono" style={{ marginTop: ".5rem" }}>
                        Tip: tap a number to save it (auto-advances to the next hole).
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
