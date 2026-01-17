import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useApi } from "../api/useApi";
import type { Course, Player, Round } from "../api/types";

type ApiError = { status: number; body: unknown };

type GuestPlayer = { name: string; handicap: number | null };

function parseHandicapFromInput(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const v = Number(s.replace("+", ""));
  if (!Number.isFinite(v)) return null;
  return s.startsWith("+") ? -Math.abs(v) : v;
}

function friendLabel(p: Player): string {
  return p.name || p.username || p.email || p.external_id;
}

export default function StartRound() {
  const { isAuthenticated, loginWithRedirect, user } = useAuth0();
  const { request } = useApi();

  const viewerId = user?.sub ?? "";

  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [otherPlayerIds, setOtherPlayerIds] = useState<string[]>(["", "", ""]);
  const [friendPlayerIds, setFriendPlayerIds] = useState<string[]>([]);

  const [friends, setFriends] = useState<Player[]>([]);
  const [friendFilter, setFriendFilter] = useState("");
  const [selectedFriend, setSelectedFriend] = useState("");

  const [addPlayerModalOpen, setAddPlayerModalOpen] = useState(false);
  const [addPlayerView, setAddPlayerView] = useState<"menu" | "friend" | "guest" | "search">("menu");

  const [playerSearchQ, setPlayerSearchQ] = useState("");
  const [playerSearchResults, setPlayerSearchResults] = useState<Player[]>([]);
  const [playerSearchLoading, setPlayerSearchLoading] = useState<string | null>(null);
  const [playerSearchMsg, setPlayerSearchMsg] = useState<string | null>(null);
  const [playerLookup, setPlayerLookup] = useState<Record<string, Player>>({});

  const [guestName, setGuestName] = useState("");
  const [guestHandicap, setGuestHandicap] = useState("");
  const [guestPlayers, setGuestPlayers] = useState<GuestPlayer[]>([]);

  const [tournamentMode, setTournamentMode] = useState(false);
  const [tournamentName, setTournamentName] = useState("");
  const [tournamentIsPublic, setTournamentIsPublic] = useState(false);
  const [tournamentId, setTournamentId] = useState<number | null>(null);

  const [statsEnabled, setStatsEnabled] = useState(false);

  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadCourses() {
    setError(null);
    setLoading("Loading courses…");
    try {
      const data = await request<Course[]>("/api/v1/courses");
      setCourses(data);
      if (data.length && selectedCourseId == null) setSelectedCourseId(data[0].id);
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to load courses (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  async function createDemoCourse() {
    setError(null);
    setLoading("Creating demo course…");
    try {
      const payload = {
        name: "Demo Course (9 holes)",
        holes: Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4 })),
      };
      const created = await request<Course>("/api/v1/courses", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCourses((prev) => [...prev, created]);
      setSelectedCourseId(created.id);
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to create course (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  async function startRound() {
    if (!selectedCourseId) return;
    if (tournamentMode && !tournamentName.trim()) {
      setError("Tournament name is required.");
      return;
    }

    setError(null);
    setLoading("Starting round…");
    try {
      const manual_ids = otherPlayerIds
        .slice(0, maxManualPlayerSlots())
        .map((s) => s.trim())
        .filter(Boolean);

      const player_ids = Array.from(new Set([...friendPlayerIds, ...manual_ids]));
      const guest_players = guestPlayers.map((g) => ({ name: g.name, handicap: g.handicap }));

      if (!tournamentMode) {
        const created = await request<Round>("/api/v1/rounds", {
          method: "POST",
          body: JSON.stringify({ course_id: selectedCourseId, stats_enabled: statsEnabled, player_ids, guest_players }),
        });
        setTournamentId(null);
        setRound(created);
        return;
      }

      const createdTournament = await request<{ id: number }>("/api/v1/tournaments", {
        method: "POST",
        body: JSON.stringify({
          course_id: selectedCourseId,
          name: tournamentName.trim(),
          is_public: tournamentIsPublic,
        }),
      });
      setTournamentId(createdTournament.id);

      const createdGroup = await request<{ round_id: number }>(
        `/api/v1/tournaments/${createdTournament.id}/rounds`,
        {
          method: "POST",
          body: JSON.stringify({ stats_enabled: statsEnabled, player_ids, guest_players }),
        }
      );

      const createdRound = await request<Round>(`/api/v1/rounds/${createdGroup.round_id}`);
      setRound(createdRound);
    } catch (e) {
      const err = e as ApiError;
      const detail =
        err.body && typeof err.body === "object" && "detail" in err.body
          ? (err.body as { detail?: unknown }).detail
          : null;
      const msg = detail != null ? String(detail) : null;
      setError(msg ? `${msg} (${err.status}).` : `Failed to start round (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  async function refreshRound(roundId: number) {
    const data = await request<Round>(`/api/v1/rounds/${roundId}`);
    setRound(data);
  }

  async function submitScore(holeNumber: number, strokes: number) {
    if (!round) return;
    setError(null);
    try {
      await request(`/api/v1/rounds/${round.id}/scores`, {
        method: "POST",
        body: JSON.stringify({ hole_number: holeNumber, strokes }),
      });
      await refreshRound(round.id);
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
      const data = await request<Player[]>(`/api/v1/players?q=${encodeURIComponent(needle)}`);
      setPlayerSearchResults(data);
      setPlayerSearchMsg(!data.length ? "No players found." : null);
      setPlayerLookup((prev) => {
        const next = { ...prev };
        for (const p of data) next[p.external_id] = p;
        return next;
      });
    } catch (e) {
      const err = e as ApiError;
      setPlayerSearchMsg(`Search failed (${err.status}).`);
    } finally {
      setPlayerSearchLoading(null);
    }
  }

  function maxManualPlayerSlots(): number {
    return Math.max(0, 3 - guestPlayers.length - friendPlayerIds.length);
  }

  function selectedPlayersCount(): number {
    const manualCount = otherPlayerIds.slice(0, maxManualPlayerSlots()).filter((x) => x.trim()).length;
    return 1 + friendPlayerIds.length + manualCount + guestPlayers.length;
  }

  function addFriendToRound(ref: string) {
    const trimmed = ref.trim();
    if (!trimmed) return;

    if (trimmed === viewerId) {
      setError("You are already in the round");
      return;
    }
    if (friendPlayerIds.includes(trimmed) || otherPlayerIds.some((x) => x.trim() === trimmed)) {
      setError("Player already added");
      return;
    }
    if (selectedPlayersCount() >= 4) {
      setError("max 4 players");
      return;
    }

    setFriendPlayerIds((prev) => [...prev, trimmed]);
  }

  function addGuest() {
    const n = guestName.trim();
    if (!n) return;
    if (selectedPlayersCount() >= 4) {
      setError("max 4 players");
      return;
    }
    setGuestPlayers((prev) => [...prev, { name: n, handicap: parseHandicapFromInput(guestHandicap) }]);
    setGuestName("");
    setGuestHandicap("");
  }

  const slots = useMemo(() => {
    const other: Array<
      | { kind: "player"; external_id: string }
      | { kind: "guest"; name: string; idx: number }
    > = [
      ...friendPlayerIds.map((external_id) => ({ kind: "player" as const, external_id })),
      ...guestPlayers.map((g, idx) => ({ kind: "guest" as const, name: g.name, idx })),
    ];
    return other;
  }, [friendPlayerIds, guestPlayers]);

  useEffect(() => {
    if (isAuthenticated) {
      void loadCourses();
      void loadFriends();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    const maxSlots = maxManualPlayerSlots();
    setOtherPlayerIds((prev) => prev.map((v, i) => (i < maxSlots ? v : "")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestPlayers.length, friendPlayerIds.length]);

  if (!isAuthenticated) {
    return (
      <div className="auth-card content-narrow">
        <h1 className="auth-title">Start New Round</h1>
        <p className="auth-subtitle">Log in to create rounds and post scores.</p>
        <button className="auth-btn primary" onClick={() => loginWithRedirect()}>
          Log in
        </button>
      </div>
    );
  }

  return (
    <div className="page content-narrow">
      <h1 className="auth-title" style={{ margin: 0 }}>
        Start New Round
      </h1>

      {error && (
        <div className="auth-card">
          <div className="auth-mono">{error}</div>
        </div>
      )}

      <div className="auth-card" style={{ display: "grid", gap: ".75rem" }}>
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
          <button className="auth-btn secondary" onClick={() => void loadCourses()}>
            Refresh courses
          </button>
          <button className="auth-btn secondary" onClick={() => void createDemoCourse()}>
            Create demo course
          </button>
        </div>

        <label style={{ display: "grid", gap: ".25rem" }}>
          <span style={{ fontWeight: 700 }}>Course</span>
          <select
            value={selectedCourseId ?? ""}
            onChange={(e) => setSelectedCourseId(Number(e.target.value))}
            disabled={!courses.length}
          >
            {!courses.length ? (
              <option value="">No courses yet</option>
            ) : (
              courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
        </label>

        <div style={{ display: "grid", gap: ".75rem" }}>
          <div style={{ display: "grid", gap: ".5rem" }}>
            <div style={{ fontWeight: 700 }}>Statistics</div>
            <label className="auth-row" style={{ gap: ".5rem" }}>
              <input
                type="checkbox"
                checked={statsEnabled}
                onChange={(e) => setStatsEnabled(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontWeight: 700 }}>Enable stats (putts, fairway, GIR)</span>
            </label>
            <div className="auth-mono">If enabled, each hole requires putts + fairway + GIR before continuing.</div>
          </div>

          <div style={{ fontWeight: 700 }}>Tournament</div>
          <label className="auth-row" style={{ gap: ".5rem" }}>
            <input
              type="checkbox"
              checked={tournamentMode}
              onChange={(e) => {
                setTournamentMode(e.target.checked);
                if (!e.target.checked) {
                  setTournamentName("");
                  setTournamentIsPublic(false);
                }
              }}
              style={{ width: 18, height: 18 }}
            />
            <span style={{ fontWeight: 700 }}>Create tournament (multiple groups)</span>
          </label>
          {tournamentMode && (
            <div style={{ display: "grid", gap: ".5rem" }}>
              <label style={{ display: "grid", gap: ".25rem" }}>
                <span style={{ fontWeight: 700 }}>Tournament name</span>
                <input
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  placeholder="e.g. Wednesday Stroke Play"
                />
              </label>

              <label className="auth-row" style={{ gap: ".5rem" }}>
                <input
                  type="checkbox"
                  checked={tournamentIsPublic}
                  onChange={(e) => setTournamentIsPublic(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ fontWeight: 700 }}>Public tournament</span>
              </label>

              <div className="auth-mono">
                You will create your own 1–4 player group. Other groups start their own rounds in the same tournament.
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: ".75rem" }}>
          <div style={{ fontWeight: 700 }}>Players (up to 4)</div>

          <div className="player-slots">
            <div className="player-slot filled">
              <div style={{ fontWeight: 800 }}>You</div>
              <div className="auth-mono">{viewerId || "—"}</div>
            </div>

            {slots.map((s) => {
              if (s.kind === "guest") {
                return (
                  <div key={`guest-${s.idx}`} className="player-slot filled">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: ".5rem",
                        flexWrap: "wrap",
                        alignItems: "flex-start",
                      }}
                    >
                      <div style={{ fontWeight: 800, minWidth: 0, flex: "1 1 160px" }}>{s.name}</div>
                      <button
                        className="auth-btn secondary"
                        style={{ padding: ".35rem .6rem", flexShrink: 0 }}
                        onClick={() => setGuestPlayers((prev) => prev.filter((_, i) => i !== s.idx))}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="auth-mono">guest</div>
                  </div>
                );
              }

              const p = friends.find((f) => f.external_id === s.external_id) ?? playerLookup[s.external_id];
              const kindLabel = friends.some((f) => f.external_id === s.external_id) ? "friend" : "player";
              const label = p ? friendLabel(p) : s.external_id;

              return (
                <div key={s.external_id} className="player-slot filled">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: ".5rem",
                      flexWrap: "wrap",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ fontWeight: 800, minWidth: 0, flex: "1 1 160px" }}>{label}</div>
                    <button
                      className="auth-btn secondary"
                      style={{ padding: ".35rem .6rem", flexShrink: 0 }}
                      onClick={() => setFriendPlayerIds((prev) => prev.filter((x) => x !== s.external_id))}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="auth-mono">{kindLabel}</div>
                </div>
              );
            })}

            {Array.from({ length: Math.max(0, 3 - slots.length) }, (_, i) => (
              <button
                key={`empty-${i}`}
                type="button"
                className="player-slot add"
                disabled={selectedPlayersCount() >= 4}
                onClick={() => {
                  setError(null);
                  setAddPlayerView("menu");
                  setAddPlayerModalOpen(true);
                }}
              >
                <div className="player-slot__plus">+</div>
                <div style={{ fontWeight: 800 }}>Add player</div>
              </button>
            ))}
          </div>

          {addPlayerModalOpen && (
            <div
              className="modal-backdrop"
              role="dialog"
              aria-modal="true"
              onClick={() => setAddPlayerModalOpen(false)}
            >
              <div className="auth-card modal-card" onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
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
                  <div style={{ display: "grid", gap: ".5rem", marginTop: ".75rem" }}>
                    <button className="auth-btn primary" onClick={() => setAddPlayerView("friend")}>
                      Add a friend
                    </button>
                    <button className="auth-btn primary" onClick={() => setAddPlayerView("guest")}>
                      Add a guest
                    </button>
                    <button className="auth-btn primary" onClick={() => setAddPlayerView("search")}>
                      Search for a player
                    </button>
                  </div>
                )}

                {addPlayerView === "friend" && (
                  <div style={{ display: "grid", gap: ".5rem", marginTop: ".75rem" }}>
                    <div className="auth-mono">Pick from your friends list.</div>
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
                          if (friendPlayerIds.includes(f.external_id)) return false;

                          const q = friendFilter.trim().toLowerCase();
                          if (!q) return true;
                          const hay = `${f.name ?? ""} ${f.username ?? ""} ${f.email ?? ""}`.toLowerCase();
                          return hay.includes(q);
                        })
                        .map((f) => (
                          <option key={f.external_id} value={f.external_id}>
                            {friendLabel(f)}
                          </option>
                        ))}
                    </select>
                    <div className="auth-row" style={{ justifyContent: "space-between" }}>
                      <button className="auth-btn secondary" onClick={() => setAddPlayerView("menu")}>
                        Back
                      </button>
                      <button
                        className="auth-btn primary"
                        onClick={() => {
                          addFriendToRound(selectedFriend);
                          setSelectedFriend("");
                          setAddPlayerModalOpen(false);
                        }}
                        disabled={!selectedFriend}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}

                {addPlayerView === "guest" && (
                  <div style={{ display: "grid", gap: ".5rem", marginTop: ".75rem" }}>
                    <div className="auth-mono">Guests are only saved for this round.</div>
                    <input
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Guest name (required)"
                    />
                    <input
                      value={guestHandicap}
                      onChange={(e) => setGuestHandicap(e.target.value)}
                      placeholder="Guest handicap (optional, e.g. +0.1)"
                    />
                    <div className="auth-row" style={{ justifyContent: "space-between" }}>
                      <button className="auth-btn secondary" onClick={() => setAddPlayerView("menu")}>
                        Back
                      </button>
                      <button
                        className="auth-btn primary"
                        onClick={() => {
                          addGuest();
                          setAddPlayerModalOpen(false);
                        }}
                        disabled={!guestName.trim()}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}

                {addPlayerView === "search" && (
                  <div style={{ display: "grid", gap: ".5rem", marginTop: ".75rem" }}>
                    <input
                      value={playerSearchQ}
                      onChange={(e) => setPlayerSearchQ(e.target.value)}
                      placeholder="Search by name, username, email, or Auth0 id"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void searchPlayers();
                      }}
                    />
                    <button className="auth-btn secondary" onClick={() => void searchPlayers()} disabled={!!playerSearchLoading}>
                      {playerSearchLoading ?? "Search"}
                    </button>

                    {playerSearchMsg && <div className="auth-mono">{playerSearchMsg}</div>}

                    {!!playerSearchResults.length && (
                      <div style={{ display: "grid", gap: ".5rem" }}>
                        {playerSearchResults
                          .filter((p) => p.external_id !== viewerId)
                          .map((p) => (
                            <div
                              key={p.external_id}
                              className="auth-row"
                              style={{ justifyContent: "space-between", alignItems: "center" }}
                            >
                              <div>
                                <div style={{ fontWeight: 800 }}>{friendLabel(p)}</div>
                                <div className="auth-mono">{p.email ?? p.username ?? p.external_id}</div>
                              </div>
                              <button
                                className="auth-btn primary"
                                disabled={friendPlayerIds.includes(p.external_id) || selectedPlayersCount() >= 4}
                                onClick={() => {
                                  addFriendToRound(p.external_id);
                                  setAddPlayerModalOpen(false);
                                }}
                              >
                                Add
                              </button>
                            </div>
                          ))}
                      </div>
                    )}

                    <div className="auth-row" style={{ justifyContent: "space-between" }}>
                      <button className="auth-btn secondary" onClick={() => setAddPlayerView("menu")}>
                        Back
                      </button>
                      <button className="auth-btn secondary" onClick={() => setAddPlayerModalOpen(false)}>
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <button
          className="auth-btn primary"
          disabled={!selectedCourseId || !!loading || (tournamentMode && !tournamentName.trim())}
          onClick={() => void startRound()}
        >
          Start round
        </button>

        {loading && <div className="auth-mono">{loading}</div>}
      </div>

      {round && (
        <div className="auth-card" style={{ display: "grid", gap: ".75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
            <div>
              <div style={{ fontWeight: 800 }}>Round #{round.id}</div>
              <div className="auth-mono">
                Course: {round.course_name} · Par {round.total_par}
              </div>
              {(tournamentId ?? round.tournament_id) && (
                <div className="auth-mono">
                  Tournament: <Link to={`/tournaments/${tournamentId ?? round.tournament_id}`}>View leaderboard</Link>
                </div>
              )}
            </div>
            <div className="auth-mono">
              Total strokes: {round.total_strokes ?? "—"}
              {round.completed_at ? " (completed)" : ""}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Link className="auth-btn secondary" to={`/rounds/${round.id}`}>
              View scorecard
            </Link>
          </div>

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
                <div className="auth-mono">
                  Hole {h.number} · Par {h.par}
                </div>
                <input
                  type="number"
                  min={1}
                  max={30}
                  defaultValue={(viewerId && h.strokes[viewerId]) ?? ""}
                  placeholder="strokes"
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
      )}
    </div>
  );
}
