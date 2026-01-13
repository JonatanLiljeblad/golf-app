import { useEffect, useState } from "react";
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

  const [guestName, setGuestName] = useState("");
  const [guestHandicap, setGuestHandicap] = useState("");
  const [guestPlayers, setGuestPlayers] = useState<GuestPlayer[]>([]);

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
    setError(null);
    setLoading("Starting round…");
    try {
      const manual_ids = otherPlayerIds
        .slice(0, maxManualPlayerSlots())
        .map((s) => s.trim())
        .filter(Boolean);

      const player_ids = Array.from(new Set([...friendPlayerIds, ...manual_ids]));
      const guest_players = guestPlayers.map((g) => ({ name: g.name, handicap: g.handicap }));
      const created = await request<Round>("/api/v1/rounds", {
        method: "POST",
        body: JSON.stringify({ course_id: selectedCourseId, player_ids, guest_players }),
      });
      setRound(created);
    } catch (e) {
      const err = e as ApiError;
      const detail = err.body && typeof err.body === "object" && "detail" in err.body ? (err.body as { detail?: unknown }).detail : null;
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
      <div className="auth-card">
        <h1 className="auth-title">Start New Round</h1>
        <p className="auth-subtitle">Log in to create rounds and post scores.</p>
        <button className="auth-btn primary" onClick={() => loginWithRedirect()}>
          Log in
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: 720 }}>
      <h1>Start New Round</h1>

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
          <div style={{ fontWeight: 700 }}>Players (up to 4)</div>
          <div className="auth-mono">You: {viewerId || "—"}</div>

          <div style={{ display: "grid", gap: ".5rem" }}>
            <div style={{ fontWeight: 700 }}>Add from friends</div>
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
            <button
              className="auth-btn secondary"
              onClick={() => {
                addFriendToRound(selectedFriend);
                setSelectedFriend("");
              }}
              disabled={!selectedFriend}
            >
              Add friend
            </button>

            {!!friendPlayerIds.length && (
              <div style={{ display: "grid", gap: ".5rem" }}>
                {friendPlayerIds.map((id) => {
                  const p = friends.find((f) => f.external_id === id);
                  return (
                    <div key={id} className="auth-row" style={{ justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{p ? friendLabel(p) : id}</div>
                        <div className="auth-mono">friend</div>
                      </div>
                      <button
                        className="auth-btn secondary"
                        onClick={() => setFriendPlayerIds((prev) => prev.filter((x) => x !== id))}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: ".5rem" }}>
            <div style={{ fontWeight: 700 }}>Or add by email / username / Auth0 id</div>
            {otherPlayerIds.map((pid, idx) => (
              <input
                key={idx}
                placeholder={
                  idx < maxManualPlayerSlots()
                    ? "Other player email or username (optional)"
                    : "Slot used by friend/guest player"
                }
                value={pid}
                disabled={idx >= maxManualPlayerSlots()}
                onChange={(e) =>
                  setOtherPlayerIds((prev) => {
                    const next = [...prev];
                    next[idx] = e.target.value;
                    return next;
                  })
                }
              />
            ))}
          </div>

          <div style={{ display: "grid", gap: ".5rem" }}>
            <div style={{ fontWeight: 700 }}>Guest players (round only)</div>
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
            <button className="auth-btn secondary" onClick={() => addGuest()} disabled={!guestName.trim()}>
              Add guest
            </button>

            {!!guestPlayers.length && (
              <div style={{ display: "grid", gap: ".5rem" }}>
                {guestPlayers.map((g, idx) => (
                  <div key={`${g.name}-${idx}`} className="auth-row" style={{ justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{g.name}</div>
                      <div className="auth-mono">guest</div>
                    </div>
                    <button
                      className="auth-btn secondary"
                      onClick={() =>
                        setGuestPlayers((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          className="auth-btn primary"
          disabled={!selectedCourseId || !!loading}
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
