import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useApi } from "../api/useApi";
import type { Course, Round } from "../api/types";

type ApiError = { status: number; body: unknown };

export default function StartRound() {
  const { isAuthenticated, loginWithRedirect } = useAuth0();
  const { request } = useApi();

  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
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
      const created = await request<Round>("/api/v1/rounds", {
        method: "POST",
        body: JSON.stringify({ course_id: selectedCourseId }),
      });
      setRound(created);
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to start round (${err.status}).`);
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

  useEffect(() => {
    if (isAuthenticated) void loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

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
                  defaultValue={h.strokes ?? ""}
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
