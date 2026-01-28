import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";

import { useApi } from "../api/useApi";
import type { Course, TournamentInvite, TournamentSummary } from "../api/types";

type ApiError = { status: number; body: unknown };

export default function Tournaments() {
  const { isAuthenticated, loginWithRedirect } = useAuth0();
  const { request } = useApi();
  const navigate = useNavigate();

  const [items, setItems] = useState<TournamentSummary[]>([]);
  const [invites, setInvites] = useState<TournamentInvite[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [tournamentName, setTournamentName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [groupsCount, setGroupsCount] = useState<number>(4);
  const [groupNames, setGroupNames] = useState<string[]>(() =>
    Array.from({ length: 4 }, (_, i) => `Group ${i + 1}`),
  );

  async function load() {
    setError(null);
    setLoading("Loading tournaments…");
    try {
      const [tData, iData] = await Promise.all([
        request<TournamentSummary[]>("/api/v1/tournaments"),
        request<TournamentInvite[]>("/api/v1/tournaments/invites"),
      ]);
      setItems(tData);
      setInvites(iData);
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to load tournaments (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  async function loadCourses() {
    setError(null);
    setCoursesLoading("Loading courses…");
    try {
      const data = await request<Course[]>("/api/v1/courses");
      setCourses(data);
      if (data.length && selectedCourseId == null)
        setSelectedCourseId(data[0].id);
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to load courses (${err.status}).`);
    } finally {
      setCoursesLoading(null);
    }
  }

  async function createTournament() {
    if (!selectedCourseId) return;

    const trimmed = tournamentName.trim();
    if (!trimmed) return;

    setError(null);
    setCreating("Creating tournament…");
    try {
      const groups = groupNames.map((g, idx) =>
        g.trim() ? g.trim() : `Group ${idx + 1}`,
      );
      const created = await request<{ id: number }>("/api/v1/tournaments", {
        method: "POST",
        body: JSON.stringify({
          course_id: selectedCourseId,
          name: trimmed,
          is_public: isPublic,
          groups,
        }),
      });
      navigate(`/tournaments/${created.id}`);
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
          : `Failed to create tournament (${err.status}).`,
      );
    } finally {
      setCreating(null);
    }
  }

  async function acceptInvite(inviteId: number) {
    setError(null);
    try {
      await request(`/api/v1/tournaments/invites/${inviteId}/accept`, {
        method: "POST",
      });
      await load();
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to accept invite (${err.status}).`);
    }
  }

  async function declineInvite(inviteId: number) {
    setError(null);
    try {
      await request(`/api/v1/tournaments/invites/${inviteId}/decline`, {
        method: "POST",
      });
      await load();
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to decline invite (${err.status}).`);
    }
  }

  useEffect(() => {
    if (isAuthenticated) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    setGroupNames((prev) => {
      const next = prev.slice(0, groupsCount);
      for (let i = next.length; i < groupsCount; i++)
        next.push(`Group ${i + 1}`);
      return next;
    });
  }, [groupsCount]);

  const active = items.filter((t) => !t.completed_at);
  const history = items.filter((t) => !!t.completed_at);

  if (!isAuthenticated) {
    return (
      <div className="auth-card content-narrow">
        <h1 className="auth-title">Tournaments</h1>
        <p className="auth-subtitle">
          Log in to view tournaments and leaderboards.
        </p>
        <button
          className="auth-btn primary"
          onClick={() => loginWithRedirect()}
        >
          Log in
        </button>
      </div>
    );
  }

  return (
    <div className="page content-narrow">
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Tournaments</h1>
        <div className="auth-row">
          <button className="auth-btn secondary" onClick={() => void load()}>
            Refresh
          </button>
          <button
            className="auth-btn secondary"
            onClick={() => {
              setError(null);
              setCreateOpen(true);
              setTournamentName("");
              setIsPublic(false);
              setGroupsCount(4);
              setGroupNames(
                Array.from({ length: 4 }, (_, i) => `Group ${i + 1}`),
              );
              if (courses.length) setSelectedCourseId(courses[0].id);
              else {
                setSelectedCourseId(null);
                void loadCourses();
              }
            }}
            disabled={createOpen}
          >
            Create tournament
          </button>
        </div>
      </div>

      {createOpen && (
        <div
          className="auth-card"
          style={{ marginTop: ".75rem", display: "grid", gap: ".75rem" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              alignItems: "center",
            }}
          >
            <div style={{ fontWeight: 800 }}>Create a tournament</div>
            <button
              className="auth-btn secondary"
              onClick={() => setCreateOpen(false)}
              disabled={!!creating}
            >
              Cancel
            </button>
          </div>

          <button
            className="auth-btn secondary"
            onClick={() => void loadCourses()}
            disabled={!!coursesLoading || !!creating}
          >
            Refresh courses
          </button>

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

          <label style={{ display: "grid", gap: ".25rem" }}>
            <span style={{ fontWeight: 700 }}>Tournament name</span>
            <input
              value={tournamentName}
              onChange={(e) => setTournamentName(e.target.value)}
              placeholder="e.g. Saturday skins"
            />
          </label>

          <label className="auth-row" style={{ gap: ".5rem" }}>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            <span style={{ fontWeight: 700 }}>Public tournament</span>
          </label>

          <label style={{ display: "grid", gap: ".25rem" }}>
            <span style={{ fontWeight: 700 }}>Groups</span>
            <select
              value={groupsCount}
              onChange={(e) => setGroupsCount(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: "grid", gap: ".5rem" }}>
            {groupNames.map((g, idx) => (
              <label key={idx} style={{ display: "grid", gap: ".25rem" }}>
                <span style={{ fontWeight: 700 }}>Group {idx + 1}</span>
                <input
                  value={g}
                  onChange={(e) =>
                    setGroupNames((prev) => {
                      const next = [...prev];
                      next[idx] = e.target.value;
                      return next;
                    })
                  }
                />
              </label>
            ))}
          </div>

          <button
            className="auth-btn primary"
            disabled={
              !selectedCourseId ||
              !tournamentName.trim() ||
              !!creating ||
              !!coursesLoading
            }
            onClick={() => void createTournament()}
          >
            Create tournament
          </button>

          {(coursesLoading || creating) && (
            <div className="auth-mono">{coursesLoading ?? creating}</div>
          )}
        </div>
      )}

      {loading && <div className="auth-mono">{loading}</div>}

      {error && (
        <div className="auth-card">
          <div className="auth-mono">{error}</div>
        </div>
      )}

      {!!invites.length && (
        <div className="auth-card" style={{ overflow: "hidden" }}>
          <div style={{ fontWeight: 800, marginBottom: ".5rem" }}>Invites</div>
          <div className="stack">
            {invites.map((i) => (
              <div key={i.id} className="card-inset">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                    alignItems: "center",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>{i.tournament_name}</div>
                    <div
                      className="auth-mono"
                      style={{ wordBreak: "break-word" }}
                    >
                      From: {i.requester_name}
                    </div>
                  </div>
                  <div
                    className="auth-row"
                    style={{ flexShrink: 0, marginTop: ".15rem" }}
                  >
                    <button
                      className="auth-btn primary"
                      onClick={() => void acceptInvite(i.id)}
                    >
                      Accept
                    </button>
                    <button
                      className="auth-btn secondary"
                      onClick={() => void declineInvite(i.id)}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!items.length && !loading ? (
        <div className="auth-card">
          <div className="auth-mono">No tournaments yet.</div>
        </div>
      ) : (
        <div className="stack">
          <div style={{ fontWeight: 800 }}>Active</div>
          {!active.length ? (
            <div className="auth-card">
              <div className="auth-mono">No active tournaments.</div>
            </div>
          ) : (
            active.map((t) => (
              <div key={t.id} className="auth-card" style={{ padding: "1rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800 }}>{t.name}</div>
                    <div className="auth-mono">
                      {t.course_name} · {t.is_public ? "Public" : "Private"} ·
                      Groups: {t.groups_count}
                    </div>
                  </div>
                  <Link
                    className="auth-btn secondary"
                    to={`/tournaments/${t.id}`}
                  >
                    View
                  </Link>
                </div>
              </div>
            ))
          )}

          {!!history.length && (
            <>
              <div style={{ fontWeight: 800, marginTop: ".5rem" }}>History</div>
              {history.map((t) => (
                <div
                  key={t.id}
                  className="auth-card"
                  style={{ padding: "1rem" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "1rem",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800 }}>{t.name}</div>
                      <div className="auth-mono">
                        {t.course_name} · {t.is_public ? "Public" : "Private"} ·
                        Finished · Groups: {t.groups_count}
                      </div>
                    </div>
                    <Link
                      className="auth-btn secondary"
                      to={`/tournaments/${t.id}`}
                    >
                      View
                    </Link>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
