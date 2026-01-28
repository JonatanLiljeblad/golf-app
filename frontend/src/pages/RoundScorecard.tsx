import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useApi } from "../api/useApi";
import { ScoreMark } from "../components/ScoreMark";
import type { Player, Round } from "../api/types";

type ApiError = { status: number; body: unknown };

function friendLabel(p: Player): string {
  return p.name || p.username || p.email || p.external_id;
}

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

  const [friends, setFriends] = useState<Player[]>([]);
  const [friendFilter, setFriendFilter] = useState("");
  const [selectedFriend, setSelectedFriend] = useState("");

  const [addPlayerModalOpen, setAddPlayerModalOpen] = useState(false);
  const [addPlayerView, setAddPlayerView] = useState<
    "menu" | "friend" | "search"
  >("menu");

  const [playerSearchQ, setPlayerSearchQ] = useState("");
  const [playerSearchResults, setPlayerSearchResults] = useState<Player[]>([]);
  const [playerSearchLoading, setPlayerSearchLoading] = useState<string | null>(
    null,
  );
  const [playerSearchMsg, setPlayerSearchMsg] = useState<string | null>(null);

  const isOwner = !!round && viewerId && round.owner_id === viewerId;
  const isTournamentRound = !!round?.tournament_id;
  const tournamentLocked =
    !!round?.tournament_completed_at || !!round?.tournament_paused_at;

  const playerLabel = useMemo(() => {
    const map: Record<string, string> = {};
    if (!round) return map;
    for (const pid of round.player_ids) {
      const meta = round.players?.find((p) => p.external_id === pid);
      map[pid] =
        pid === viewerId
          ? "You"
          : (meta?.username ?? meta?.name ?? meta?.email ?? pid);
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
  const activeHole =
    holes.find((h) => h.number === activeHoleNumber) ?? holes[0] ?? null;

  const statsEnabled = !!round?.stats_enabled;

  const canEdit = (pid: string) =>
    !round?.completed_at && !tournamentLocked && (pid === viewerId || isOwner);
  const isParticipant =
    !!round && !!viewerId && round.player_ids.includes(viewerId);
  const readOnlyTournamentGroup =
    !!round?.tournament_id && !isOwner && !isParticipant;

  const isActivePar3 = activeHole?.par === 3;

  const activeSavedStrokes = activeHole
    ? (activeHole.strokes?.[activePlayerId] ?? null)
    : null;
  const activeSavedPutts = activeHole
    ? (activeHole.putts?.[activePlayerId] ?? null)
    : null;
  const activeSavedFairway = activeHole
    ? (activeHole.fairway?.[activePlayerId] ?? null)
    : null;
  const activeSavedGir = activeHole
    ? (activeHole.gir?.[activePlayerId] ?? null)
    : null;
  const activeSavedComplete =
    activeSavedStrokes != null &&
    (!statsEnabled ||
      (activeSavedPutts != null &&
        !!activeSavedGir &&
        (isActivePar3 || !!activeSavedFairway)));
  const blockHoleAdvance = !!(
    statsEnabled &&
    canEdit(activePlayerId) &&
    !activeSavedComplete
  );

  const [viewMode, setViewMode] = useState<"hole" | "scorecard">(
    readOnlyTournamentGroup ? "scorecard" : "hole",
  );

  useEffect(() => {
    if (readOnlyTournamentGroup) setViewMode("scorecard");
  }, [readOnlyTournamentGroup]);

  useEffect(() => {
    if (round?.completed_at) setViewMode("scorecard");
  }, [round?.completed_at]);

  useEffect(() => {
    if (!activeHole) return;
    const pid = activePlayerId;
    setDraftStrokes(activeHole.strokes?.[pid] ?? null);
    setDraftPutts(activeHole.putts?.[pid] ?? null);
    setDraftFairway(activeHole.fairway?.[pid] ?? null);
    setDraftGir(activeHole.gir?.[pid] ?? null);
  }, [activeHole, activePlayerId]);

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

  function sumDiff(pid: string, hs: typeof holes) {
    let total = 0;
    let any = false;
    for (const h of hs) {
      const v = h.strokes?.[pid] ?? null;
      if (v != null) {
        total += v - h.par;
        any = true;
      }
    }
    return any ? total : null;
  }

  function fmtDiff(d: number) {
    if (d === 0) return "E";
    return d > 0 ? `+${d}` : `${d}`;
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

  function countDir(
    pid: string,
    hs: typeof holes,
    field: "fairway" | "gir",
    target: string,
  ) {
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
    extra?: {
      putts?: number | null;
      fairway?: string | null;
      gir?: string | null;
    },
  ) {
    if (
      !round ||
      round.completed_at ||
      tournamentLocked ||
      readOnlyTournamentGroup
    )
      return;
    setError(null);
    try {
      await request(`/api/v1/rounds/${round.id}/scores`, {
        method: "POST",
        body: JSON.stringify({
          hole_number: holeNumber,
          strokes,
          player_id: playerId,
          ...(extra ?? {}),
        }),
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

  async function loadFriends() {
    try {
      const data = await request<Player[]>("/api/v1/friends");
      setFriends(data);
    } catch {
      // ignore
    }
  }

  async function searchPlayers() {
    const needle = playerSearchQ.trim();
    if (!needle) {
      setPlayerSearchResults([]);
      setPlayerSearchMsg(null);
      return;
    }

    setPlayerSearchMsg(null);
    setPlayerSearchLoading("Searching…");
    try {
      const data = await request<Player[]>(
        `/api/v1/players?q=${encodeURIComponent(needle)}`,
      );
      setPlayerSearchResults(data);
      setPlayerSearchMsg(!data.length ? "No players found." : null);
    } catch (e) {
      const err = e as ApiError;
      setPlayerSearchMsg(`Search failed (${err.status}).`);
    } finally {
      setPlayerSearchLoading(null);
    }
  }

  async function addPlayer(ref: string) {
    if (!round || !isOwner || round.completed_at) return;
    const pid = ref.trim();
    if (!pid) return;

    setError(null);
    try {
      await request(`/api/v1/rounds/${round.id}/participants`, {
        method: "POST",
        body: JSON.stringify({ player_ids: [pid] }),
      });
      await load(round.id);
      setAddPlayerModalOpen(false);
      setAddPlayerView("menu");
      setSelectedFriend("");
    } catch (e) {
      const err = e as ApiError;
      const detail =
        err.body && typeof err.body === "object" && "detail" in err.body
          ? (err.body as { detail?: unknown }).detail
          : null;
      const msg = detail != null ? String(detail) : null;
      setError(
        msg
          ? `${msg} (${err.status}).`
          : `Failed to add player (${err.status}).`,
      );
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
      const detail =
        err.body && typeof err.body === "object" && "detail" in err.body
          ? (err.body as { detail?: unknown }).detail
          : null;
      const msg = detail != null ? String(detail) : null;
      setError(
        msg
          ? `${msg} (${err.status}).`
          : `Failed to delete round (${err.status}).`,
      );
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
    void loadFriends();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, roundId]);

  useEffect(() => {
    if (!round) return;

    // Keep selected player valid.
    if (!round.player_ids.includes(activePlayerId)) {
      setActivePlayerId(
        viewerId && round.player_ids.includes(viewerId)
          ? viewerId
          : (round.player_ids[0] ?? ""),
      );
    }

    // Start on the first hole without a score for the active player (fallback to first hole).
    const pid =
      activePlayerId && round.player_ids.includes(activePlayerId)
        ? activePlayerId
        : viewerId && round.player_ids.includes(viewerId)
          ? viewerId
          : round.player_ids[0];
    const firstOpen = pid
      ? round.holes.find((h) => (h.strokes?.[pid] ?? null) == null)
      : null;
    const preferred = firstOpen?.number ?? round.holes[0]?.number ?? 1;
    if (!round.holes.some((h) => h.number === activeHoleNumber))
      setActiveHoleNumber(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id]);

  if (!isAuthenticated) {
    return (
      <div className="auth-card content-narrow">
        <h1 className="auth-title">Round</h1>
        <p className="auth-subtitle">Log in to view your scorecard.</p>
        <button
          className="auth-btn primary"
          onClick={() => loginWithRedirect()}
        >
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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <div>
                <div style={{ fontWeight: 800 }}>
                  {round.course_name} · Round #{round.id}
                </div>
                <div className="auth-mono">Par {round.total_par}</div>
                {!!round.course_handicap_by_player && viewerId && (
                  <div className="auth-mono">
                    Course hcp: {round.course_handicap_by_player[viewerId] ?? 0}
                  </div>
                )}
                <div className="auth-mono">
                  {round.completed_at ? "Completed" : "In progress"} · Your
                  strokes: {round.total_strokes ?? "—"}
                  {statsEnabled ? " · Stats: On" : " · Stats: Off"}
                </div>
              </div>
              <div className="auth-row">
                {round.tournament_id && (
                  <Link
                    className="auth-btn secondary"
                    to={`/tournaments/${round.tournament_id}`}
                  >
                    Tournament
                  </Link>
                )}
                <button
                  className="auth-btn secondary"
                  onClick={() => void load(round.id)}
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>

          {(round.tournament_completed_at || round.tournament_paused_at) && (
            <div className="auth-card" style={{ margin: 0, maxWidth: "none" }}>
              <div style={{ fontWeight: 800 }}>
                {round.tournament_completed_at
                  ? "Tournament finished"
                  : "Tournament paused"}
              </div>
              <div className="auth-mono" style={{ marginTop: ".25rem" }}>
                {round.tournament_completed_at
                  ? "Scores are locked."
                  : round.tournament_pause_message ||
                    "Scores are temporarily locked."}
              </div>
            </div>
          )}

          <div className="auth-card" style={{ margin: 0, maxWidth: "none" }}>
            <div style={{ display: "grid", gap: ".75rem" }}>
              <div className="auth-mono">
                Players: {round.player_ids.length} / 4
              </div>

              <div className="player-slots">
                {round.player_ids.map((pid) => (
                  <div key={`pid-${pid}`} className="player-slot filled">
                    <div style={{ fontWeight: 800 }}>
                      {playerLabel[pid] ?? pid}
                    </div>
                    <div className="auth-mono">{pid}</div>
                  </div>
                ))}

                {isOwner &&
                  !round.completed_at &&
                  Array.from(
                    { length: Math.max(0, 4 - round.player_ids.length) },
                    (_, i) => (
                      <button
                        key={`empty-${i}`}
                        type="button"
                        className="player-slot add"
                        onClick={() => {
                          setAddPlayerView("menu");
                          setAddPlayerModalOpen(true);
                          setPlayerSearchMsg(null);
                          setPlayerSearchResults([]);
                          setPlayerSearchQ("");
                        }}
                        disabled={round.player_ids.length >= 4}
                      >
                        <div className="player-slot__plus">+</div>
                        <div style={{ fontWeight: 800 }}>Add player</div>
                      </button>
                    ),
                  )}
              </div>

              {addPlayerModalOpen && (
                <div
                  className="modal-backdrop"
                  role="dialog"
                  aria-modal="true"
                  onClick={() => setAddPlayerModalOpen(false)}
                >
                  <div
                    className="auth-card modal-card"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "1rem",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>Add player</div>
                      <button
                        className="auth-btn secondary"
                        style={{ padding: ".45rem .7rem" }}
                        onClick={() => setAddPlayerModalOpen(false)}
                      >
                        Close
                      </button>
                    </div>

                    {addPlayerView === "menu" && (
                      <div
                        style={{
                          display: "grid",
                          gap: ".5rem",
                          marginTop: ".75rem",
                        }}
                      >
                        <button
                          className="auth-btn primary"
                          onClick={() => setAddPlayerView("friend")}
                        >
                          Add a friend
                        </button>
                        <button
                          className="auth-btn primary"
                          onClick={() => setAddPlayerView("search")}
                        >
                          Search for a player
                        </button>
                      </div>
                    )}

                    {addPlayerView === "friend" && (
                      <div
                        style={{
                          display: "grid",
                          gap: ".5rem",
                          marginTop: ".75rem",
                        }}
                      >
                        <div className="auth-mono">
                          Pick from your friends list.
                        </div>
                        <input
                          value={friendFilter}
                          onChange={(e) => setFriendFilter(e.target.value)}
                          placeholder="Search your friends"
                        />
                        <select
                          value={selectedFriend}
                          onChange={(e) => setSelectedFriend(e.target.value)}
                          disabled={!friends.length}
                        >
                          <option value="">Select friend…</option>
                          {friends
                            .filter((f) => {
                              if (f.external_id === viewerId) return false;
                              if (round.player_ids.includes(f.external_id))
                                return false;

                              const q = friendFilter.trim().toLowerCase();
                              if (!q) return true;
                              const hay =
                                `${f.name ?? ""} ${f.username ?? ""} ${f.email ?? ""}`.toLowerCase();
                              return hay.includes(q);
                            })
                            .map((f) => (
                              <option key={f.external_id} value={f.external_id}>
                                {friendLabel(f)}
                              </option>
                            ))}
                        </select>
                        <div
                          className="auth-row"
                          style={{ justifyContent: "space-between" }}
                        >
                          <button
                            className="auth-btn secondary"
                            onClick={() => setAddPlayerView("menu")}
                          >
                            Back
                          </button>
                          <button
                            className="auth-btn primary"
                            onClick={() => void addPlayer(selectedFriend)}
                            disabled={
                              !selectedFriend || round.player_ids.length >= 4
                            }
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}

                    {addPlayerView === "search" && (
                      <div
                        style={{
                          display: "grid",
                          gap: ".5rem",
                          marginTop: ".75rem",
                        }}
                      >
                        <input
                          value={playerSearchQ}
                          onChange={(e) => setPlayerSearchQ(e.target.value)}
                          placeholder="Search by name, username, email, or Auth0 id"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void searchPlayers();
                          }}
                        />
                        <button
                          className="auth-btn secondary"
                          onClick={() => void searchPlayers()}
                          disabled={!!playerSearchLoading}
                        >
                          {playerSearchLoading ?? "Search"}
                        </button>

                        {playerSearchMsg && (
                          <div className="auth-mono">{playerSearchMsg}</div>
                        )}

                        {!!playerSearchResults.length && (
                          <div style={{ display: "grid", gap: ".5rem" }}>
                            {playerSearchResults
                              .filter((p) => p.external_id !== viewerId)
                              .map((p) => (
                                <div
                                  key={p.external_id}
                                  className="auth-row"
                                  style={{
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                  }}
                                >
                                  <div>
                                    <div style={{ fontWeight: 800 }}>
                                      {friendLabel(p)}
                                    </div>
                                    <div className="auth-mono">
                                      {p.email ?? p.username ?? p.external_id}
                                    </div>
                                  </div>
                                  <button
                                    className="auth-btn primary"
                                    disabled={
                                      round.player_ids.includes(
                                        p.external_id,
                                      ) || round.player_ids.length >= 4
                                    }
                                    onClick={() =>
                                      void addPlayer(p.external_id)
                                    }
                                  >
                                    Add
                                  </button>
                                </div>
                              ))}
                          </div>
                        )}

                        <div
                          className="auth-row"
                          style={{ justifyContent: "space-between" }}
                        >
                          <button
                            className="auth-btn secondary"
                            onClick={() => setAddPlayerView("menu")}
                          >
                            Back
                          </button>
                          <button
                            className="auth-btn secondary"
                            onClick={() => setAddPlayerModalOpen(false)}
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isOwner && !round.completed_at && !isTournamentRound && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    className="auth-btn secondary"
                    onClick={() => void deleteRound()}
                  >
                    Delete round
                  </button>
                </div>
              )}

              {!readOnlyTournamentGroup && (
                <div
                  className="auth-row"
                  style={{ justifyContent: "flex-end" }}
                >
                  <button
                    className={
                      viewMode === "hole"
                        ? "auth-btn primary"
                        : "auth-btn secondary"
                    }
                    onClick={() => setViewMode("hole")}
                    disabled={!!round.completed_at || tournamentLocked}
                  >
                    Input
                  </button>
                  <button
                    className={
                      viewMode === "scorecard"
                        ? "auth-btn primary"
                        : "auth-btn secondary"
                    }
                    onClick={() => setViewMode("scorecard")}
                  >
                    Scorecard
                  </button>
                </div>
              )}

              {(viewMode === "scorecard" || readOnlyTournamentGroup) && (
                <div style={{ display: "grid", gap: ".75rem" }}>
                  <div style={{ display: "grid", gap: ".75rem" }}>
                    <div className="scorecard-section">
                      <div className="table-scroll">
                        <table className="scorecard-table">
                          <thead>
                            <tr>
                              <th
                                className="auth-mono"
                                style={{ textAlign: "left" }}
                              >
                                Hole
                              </th>
                              {front9.map((h) => (
                                <th key={`h${h.number}`}>
                                  <button
                                    className="scorecard-holelink"
                                    type="button"
                                    onClick={() =>
                                      setActiveHoleNumber(h.number)
                                    }
                                  >
                                    {h.number}
                                  </button>
                                </th>
                              ))}
                              <th className="auth-mono">Out</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="auth-mono">Par</td>
                              {front9.map((h) => (
                                <td
                                  key={`par${h.number}`}
                                  className="auth-mono"
                                >
                                  {h.par}
                                </td>
                              ))}
                              <td className="auth-mono">
                                {front9.length ? sumPar(front9) : "—"}
                              </td>
                            </tr>

                            {round.player_ids.map((pid) => {
                              const out = sumStrokes(pid, front9);
                              return (
                                <tr key={`p-front-${pid}`}>
                                  <td
                                    style={{
                                      fontWeight: 800,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {playerLabel[pid] ?? pid}
                                  </td>
                                  {front9.map((h) => (
                                    <td
                                      key={`${pid}-${h.number}`}
                                      title={
                                        statsEnabled
                                          ? `P:${h.putts?.[pid] ?? "—"} FIR:${dirLabel(h.fairway?.[pid])} GIR:${dirLabel(h.gir?.[pid])}`
                                          : undefined
                                      }
                                    >
                                      <div
                                        style={{
                                          position: "relative",
                                          minHeight: 18,
                                        }}
                                      >
                                        {(() => {
                                          const hs =
                                            h.handicap_strokes?.[pid] ?? 0;
                                          return hs ? (
                                            <div
                                              className="hole-hcpbadge"
                                              style={{
                                                position: "absolute",
                                                top: -2,
                                                right: -2,
                                                fontSize: ".7rem",
                                                fontWeight: 900,
                                                opacity: 0.95,
                                              }}
                                            >
                                              {hs > 0 ? `+${hs}` : `${hs}`}
                                            </div>
                                          ) : null;
                                        })()}
                                        {(() => {
                                          const v = h.strokes?.[pid] ?? null;
                                          return v != null ? (
                                            <ScoreMark
                                              strokes={v}
                                              par={h.par}
                                            />
                                          ) : (
                                            ""
                                          );
                                        })()}
                                      </div>
                                    </td>
                                  ))}
                                  <td className="auth-mono">{out ?? "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {back9.length > 0 && (
                      <div className="scorecard-section">
                        <div className="table-scroll">
                          <table className="scorecard-table">
                            <thead>
                              <tr>
                                <th
                                  className="auth-mono"
                                  style={{ textAlign: "left" }}
                                >
                                  Hole
                                </th>
                                {back9.map((h) => (
                                  <th key={`h${h.number}`}>
                                    <button
                                      className="scorecard-holelink"
                                      type="button"
                                      onClick={() =>
                                        setActiveHoleNumber(h.number)
                                      }
                                    >
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
                                {back9.map((h) => (
                                  <td
                                    key={`par${h.number}`}
                                    className="auth-mono"
                                  >
                                    {h.par}
                                  </td>
                                ))}
                                <td className="auth-mono">
                                  {back9.length ? sumPar(back9) : "—"}
                                </td>
                                <td className="auth-mono">
                                  {holes.length ? sumPar(holes) : "—"}
                                </td>
                              </tr>

                              {round.player_ids.map((pid) => {
                                const inn = sumStrokes(pid, back9);
                                const tot = sumStrokes(pid, holes);
                                const totDiff = sumDiff(pid, holes);

                                return (
                                  <tr key={`p-back-${pid}`}>
                                    <td
                                      style={{
                                        fontWeight: 800,
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {playerLabel[pid] ?? pid}
                                    </td>
                                    {back9.map((h) => (
                                      <td
                                        key={`${pid}-${h.number}`}
                                        title={
                                          statsEnabled
                                            ? `P:${h.putts?.[pid] ?? "—"} FIR:${dirLabel(h.fairway?.[pid])} GIR:${dirLabel(h.gir?.[pid])}`
                                            : undefined
                                        }
                                      >
                                        <div
                                          style={{
                                            position: "relative",
                                            minHeight: 18,
                                          }}
                                        >
                                          {(() => {
                                            const hs =
                                              h.handicap_strokes?.[pid] ?? 0;
                                            return hs ? (
                                              <div
                                                className="hole-hcpbadge"
                                                style={{
                                                  position: "absolute",
                                                  top: -2,
                                                  right: -2,
                                                  fontSize: ".7rem",
                                                  fontWeight: 900,
                                                  opacity: 0.95,
                                                }}
                                              >
                                                {hs > 0 ? `+${hs}` : `${hs}`}
                                              </div>
                                            ) : null;
                                          })()}
                                          {(() => {
                                            const v = h.strokes?.[pid] ?? null;
                                            return v != null ? (
                                              <ScoreMark
                                                strokes={v}
                                                par={h.par}
                                              />
                                            ) : (
                                              ""
                                            );
                                          })()}
                                        </div>
                                      </td>
                                    ))}
                                    <td className="auth-mono">{inn ?? "—"}</td>
                                    <td className="auth-mono">
                                      {tot != null
                                        ? totDiff != null
                                          ? `${tot} (${fmtDiff(totDiff)})`
                                          : `${tot}`
                                        : "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <div className="scorecard-footer">
                      <div className="scorecard-footer__item">
                        <div className="auth-mono">Par</div>
                        <div style={{ fontWeight: 900 }}>
                          {holes.length ? sumPar(holes) : "—"}
                        </div>
                      </div>
                      {round.player_ids.map((pid) => {
                        const tot = sumStrokes(pid, holes);
                        const totDiff = sumDiff(pid, holes);
                        return (
                          <div
                            key={`ft-${pid}`}
                            className="scorecard-footer__item"
                          >
                            <div
                              className="auth-mono"
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {playerLabel[pid] ?? pid}
                            </div>
                            <div style={{ fontWeight: 900 }}>
                              {tot != null
                                ? totDiff != null
                                  ? `${tot} (${fmtDiff(totDiff)})`
                                  : `${tot}`
                                : "—"}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {round.completed_at && statsEnabled && (
                      <div className="scorecard-stats">
                        <div className="scorecard-stats__header">
                          <div style={{ fontWeight: 900 }}>Statistics</div>
                          <div className="auth-mono">Puts · FIR · GIR</div>
                        </div>

                        <div className="scorecard-stats__grid">
                          {round.player_ids.map((pid) => {
                            const putts = sumPutts(pid, holes);
                            const fir = countDir(pid, holes, "fairway", "hit");
                            const gir = countDir(pid, holes, "gir", "hit");

                            const firPct = fir.total
                              ? Math.round((fir.hit / fir.total) * 100)
                              : null;
                            const girPct = gir.total
                              ? Math.round((gir.hit / gir.total) * 100)
                              : null;

                            return (
                              <div
                                key={`stats-${pid}`}
                                className="scorecard-stats__item"
                              >
                                <div className="scorecard-stats__name auth-mono">
                                  {playerLabel[pid] ?? pid}
                                </div>
                                <div className="scorecard-stats__metrics">
                                  <div className="scorecard-stats__metric">
                                    <div className="auth-mono">P</div>
                                    <div style={{ fontWeight: 900 }}>
                                      {putts ?? "—"}
                                    </div>
                                  </div>
                                  <div className="scorecard-stats__metric">
                                    <div className="auth-mono">FIR</div>
                                    <div style={{ fontWeight: 900 }}>
                                      {firPct != null ? `${firPct}%` : "—"}
                                    </div>
                                  </div>
                                  <div className="scorecard-stats__metric">
                                    <div className="auth-mono">GIR</div>
                                    <div style={{ fontWeight: 900 }}>
                                      {girPct != null ? `${girPct}%` : "—"}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {activeHole && (
                    <div
                      className="scorecard-hole"
                      style={{ display: "grid", gap: ".75rem" }}
                    >
                      <div className="scorecard-hole__header">
                        <div>
                          <div style={{ fontWeight: 900 }}>
                            Hole {activeHole.number} / {holes.length}
                          </div>
                          <div className="auth-mono">
                            Par {activeHole.par}
                            {activeHole.distance != null
                              ? ` · ${activeHole.distance}m`
                              : ""}
                            {activeHole.hcp != null
                              ? ` · HCP ${activeHole.hcp}`
                              : ""}
                          </div>
                        </div>
                        <div className="scorecard-hole__nav">
                          <button
                            className="auth-btn secondary"
                            onClick={() => {
                              const idx = holes.findIndex(
                                (h) => h.number === activeHole.number,
                              );
                              const prev = idx > 0 ? holes[idx - 1] : null;
                              if (prev) setActiveHoleNumber(prev.number);
                            }}
                            disabled={
                              holes.findIndex(
                                (h) => h.number === activeHole.number,
                              ) <= 0
                            }
                          >
                            Prev
                          </button>
                          <button
                            className="auth-btn secondary"
                            onClick={() => {
                              const idx = holes.findIndex(
                                (h) => h.number === activeHole.number,
                              );
                              const next = idx >= 0 ? holes[idx + 1] : null;
                              if (next) setActiveHoleNumber(next.number);
                            }}
                            disabled={
                              holes.findIndex(
                                (h) => h.number === activeHole.number,
                              ) >=
                              holes.length - 1
                            }
                          >
                            Next
                          </button>
                          {!readOnlyTournamentGroup && (
                            <button
                              className="auth-btn primary"
                              onClick={() => setViewMode("hole")}
                            >
                              Input
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="scorecard-hole__summary">
                        {round.player_ids.map((pid) => (
                          <div
                            key={`sum-${pid}`}
                            className="scorecard-hole__summaryItem"
                          >
                            <div
                              className="auth-mono"
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {playerLabel[pid] ?? pid}
                            </div>
                            <div
                              style={{ fontWeight: 900, fontSize: "1.15rem" }}
                            >
                              {(() => {
                                const v = activeHole.strokes?.[pid] ?? null;
                                return v != null ? (
                                  <ScoreMark strokes={v} par={activeHole.par} />
                                ) : (
                                  "—"
                                );
                              })()}
                            </div>
                            {statsEnabled && (
                              <div
                                className="auth-mono"
                                style={{ marginTop: ".55rem" }}
                              >
                                P {activeHole.putts?.[pid] ?? "—"} · FIR{" "}
                                {dirLabel(activeHole.fairway?.[pid])} · GIR{" "}
                                {dirLabel(activeHole.gir?.[pid])}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {viewMode === "hole" &&
                !readOnlyTournamentGroup &&
                activeHole && (
                  <div
                    className="scorecard-hole"
                    style={{ display: "grid", gap: ".75rem" }}
                  >
                    <div className="scorecard-hole__header">
                      <div>
                        <div style={{ fontWeight: 900 }}>
                          Hole {activeHole.number} / {holes.length}
                        </div>
                        <div className="auth-mono">
                          Par {activeHole.par}
                          {activeHole.distance != null
                            ? ` · ${activeHole.distance}m`
                            : ""}
                          {activeHole.hcp != null
                            ? ` · HCP ${activeHole.hcp}`
                            : ""}
                        </div>
                      </div>
                      <div className="scorecard-hole__nav">
                        <button
                          className="auth-btn secondary"
                          onClick={() => {
                            const idx = holes.findIndex(
                              (h) => h.number === activeHole.number,
                            );
                            const prev = idx > 0 ? holes[idx - 1] : null;
                            if (prev) setActiveHoleNumber(prev.number);
                          }}
                          disabled={
                            holes.findIndex(
                              (h) => h.number === activeHole.number,
                            ) <= 0
                          }
                        >
                          Prev
                        </button>
                        <button
                          className="auth-btn secondary"
                          onClick={() => {
                            const idx = holes.findIndex(
                              (h) => h.number === activeHole.number,
                            );
                            const next = idx >= 0 ? holes[idx + 1] : null;
                            if (next) setActiveHoleNumber(next.number);
                          }}
                          disabled={
                            holes.findIndex(
                              (h) => h.number === activeHole.number,
                            ) >=
                              holes.length - 1 || !!blockHoleAdvance
                          }
                        >
                          Next
                        </button>
                      </div>
                    </div>

                    <div className="scorecard-players">
                      {round.player_ids.map((pid) => (
                        <button
                          key={pid}
                          className={
                            activePlayerId === pid
                              ? "auth-btn primary"
                              : "auth-btn secondary"
                          }
                          onClick={() => setActivePlayerId(pid)}
                          title={
                            !canEdit(pid)
                              ? "Only the round owner can enter scores for others"
                              : undefined
                          }
                        >
                          {playerLabel[pid] ?? pid}
                        </button>
                      ))}
                    </div>

                    <div className="scorecard-hole__summary">
                      {round.player_ids.map((pid) => (
                        <div
                          key={`sum-${pid}`}
                          className="scorecard-hole__summaryItem"
                        >
                          <div
                            className="auth-mono"
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {playerLabel[pid] ?? pid}
                          </div>
                          <div style={{ fontWeight: 900, fontSize: "1.15rem" }}>
                            {(() => {
                              const v = activeHole.strokes?.[pid] ?? null;
                              return v != null ? (
                                <ScoreMark strokes={v} par={activeHole.par} />
                              ) : (
                                "—"
                              );
                            })()}
                          </div>
                          {statsEnabled && (
                            <div
                              className="auth-mono"
                              style={{ marginTop: ".55rem" }}
                            >
                              P {activeHole.putts?.[pid] ?? "—"} · FIR{" "}
                              {dirLabel(activeHole.fairway?.[pid])} · GIR{" "}
                              {dirLabel(activeHole.gir?.[pid])}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="scorepad">
                      <div
                        className="auth-mono"
                        style={{ marginBottom: ".25rem" }}
                      >
                        Enter strokes for{" "}
                        <span style={{ fontWeight: 900 }}>
                          {playerLabel[activePlayerId] ?? activePlayerId}
                        </span>
                      </div>

                      <div className="scorepad-grid">
                        {(padPage === 1
                          ? [1, 2, 3, 4, 5, 6, 7, 8, 9]
                          : [10, 11, 12, 13, 14, 15, 16, 17, 18]
                        ).map((n) => (
                          <button
                            key={n}
                            type="button"
                            className="scorepad-btn"
                            style={
                              draftStrokes === n
                                ? {
                                    background: "rgba(255, 255, 255, 0.12)",
                                    borderColor: "rgba(255, 255, 255, 0.35)",
                                  }
                                : undefined
                            }
                            disabled={!canEdit(activePlayerId)}
                            onClick={() => {
                              if (statsEnabled) setDraftStrokes(n);
                              else
                                void submitScore(
                                  activeHole.number,
                                  activePlayerId,
                                  n,
                                );
                            }}
                          >
                            {n}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="scorepad-btn secondary"
                          onClick={() => setPadPage(padPage === 1 ? 2 : 1)}
                        >
                          {padPage === 1 ? ">" : "<"}
                        </button>
                      </div>

                      {statsEnabled && (
                        <div
                          style={{
                            display: "grid",
                            gap: ".75rem",
                            marginTop: ".75rem",
                          }}
                        >
                          <div>
                            <div
                              className="auth-mono"
                              style={{ marginBottom: ".35rem" }}
                            >
                              Putts
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(3, minmax(0, 1fr))",
                                gap: ".6rem",
                              }}
                            >
                              {[0, 1, 2, 3, 4, 5].map((n) => (
                                <button
                                  key={`p-${n}`}
                                  type="button"
                                  className="scorepad-btn"
                                  style={
                                    draftPutts === n
                                      ? {
                                          background:
                                            "rgba(255, 255, 255, 0.12)",
                                          borderColor:
                                            "rgba(255, 255, 255, 0.35)",
                                        }
                                      : undefined
                                  }
                                  disabled={!canEdit(activePlayerId)}
                                  onClick={() => setDraftPutts(n)}
                                >
                                  {n}
                                </button>
                              ))}
                            </div>
                          </div>

                          {!isActivePar3 && (
                            <div>
                              <div
                                className="auth-mono"
                                style={{ marginBottom: ".35rem" }}
                              >
                                Fairway
                              </div>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "repeat(4, minmax(0, 1fr))",
                                  gap: ".6rem",
                                }}
                              >
                                {["left", "hit", "right", "short"].map((v) => (
                                  <button
                                    key={`f-${v}`}
                                    type="button"
                                    className="scorepad-btn"
                                    style={
                                      draftFairway === v
                                        ? {
                                            background:
                                              "rgba(255, 255, 255, 0.12)",
                                            borderColor:
                                              "rgba(255, 255, 255, 0.35)",
                                          }
                                        : undefined
                                    }
                                    disabled={!canEdit(activePlayerId)}
                                    onClick={() => setDraftFairway(v)}
                                  >
                                    {v === "hit" ? "Hit" : v}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div>
                            <div
                              className="auth-mono"
                              style={{ marginBottom: ".35rem" }}
                            >
                              GIR
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(5, minmax(0, 1fr))",
                                gap: ".6rem",
                              }}
                            >
                              {["left", "hit", "right", "short", "long"].map(
                                (v) => (
                                  <button
                                    key={`g-${v}`}
                                    type="button"
                                    className="scorepad-btn"
                                    style={
                                      draftGir === v
                                        ? {
                                            background:
                                              "rgba(255, 255, 255, 0.12)",
                                            borderColor:
                                              "rgba(255, 255, 255, 0.35)",
                                          }
                                        : undefined
                                    }
                                    disabled={!canEdit(activePlayerId)}
                                    onClick={() => setDraftGir(v)}
                                  >
                                    {v === "hit" ? "Hit" : v}
                                  </button>
                                ),
                              )}
                            </div>
                          </div>

                          <button
                            className="auth-btn primary"
                            disabled={
                              !canEdit(activePlayerId) ||
                              draftStrokes == null ||
                              draftPutts == null ||
                              (!isActivePar3 && !draftFairway) ||
                              !draftGir
                            }
                            onClick={() =>
                              draftStrokes != null
                                ? void submitScore(
                                    activeHole.number,
                                    activePlayerId,
                                    draftStrokes,
                                    {
                                      putts: draftPutts,
                                      fairway: isActivePar3
                                        ? null
                                        : draftFairway,
                                      gir: draftGir,
                                    },
                                  )
                                : undefined
                            }
                          >
                            Save & Next
                          </button>

                          <div className="auth-mono">
                            Tip: pick strokes + stats, then Save (auto-advances
                            to the next hole).
                          </div>
                        </div>
                      )}

                      {!statsEnabled && (
                        <div
                          className="auth-mono"
                          style={{ marginTop: ".5rem" }}
                        >
                          Tip: tap a number to save it (auto-advances to the
                          next hole).
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
