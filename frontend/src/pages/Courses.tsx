import { useEffect, useMemo, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";

import { useApi } from "../api/useApi";
import type { Course } from "../api/types";

type ApiError = { status: number; body: unknown };

function mkHoles(count: 9 | 18) {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    par: 4,
    distance: null as number | null,
    hcp: null as number | null,
  }));
}

export default function Courses() {
  const { isAuthenticated, loginWithRedirect } = useAuth0();
  const { request } = useApi();

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [holesCount, setHolesCount] = useState<9 | 18>(9);
  const [holes, setHoles] = useState(() => mkHoles(9));

  useEffect(() => {
    setHoles(mkHoles(holesCount));
  }, [holesCount]);

  const totalPar = useMemo(() => holes.reduce((acc, h) => acc + h.par, 0), [holes]);

  async function load() {
    setError(null);
    setLoading("Loading courses…");
    try {
      const data = await request<Course[]>("/api/v1/courses");
      setCourses(data);
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to load courses (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  async function createCourse() {
    const trimmed = name.trim();
    if (!trimmed) return;

    setError(null);
    setLoading("Creating course…");
    try {
      const created = await request<Course>("/api/v1/courses", {
        method: "POST",
        body: JSON.stringify({ name: trimmed, holes }),
      });
      setCourses((prev) => [...prev, created]);
      setName("");
      setHoles(mkHoles(holesCount));
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to create course (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  async function deleteCourse(courseId: number) {
    setError(null);
    setLoading("Deleting course…");
    try {
      await request(`/api/v1/courses/${courseId}`, { method: "DELETE" });
      setCourses((prev) => prev.filter((c) => c.id !== courseId));
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to delete course (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => {
    if (isAuthenticated) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="auth-card">
        <h1 className="auth-title">Courses</h1>
        <p className="auth-subtitle">Log in to create and manage your courses.</p>
        <button className="auth-btn primary" onClick={() => loginWithRedirect()}>
          Log in
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: 720 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
        <h1 style={{ margin: 0 }}>Courses</h1>
        <button className="auth-btn secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {loading && <div className="auth-mono">{loading}</div>}

      {error && (
        <div className="auth-card">
          <div className="auth-mono">{error}</div>
        </div>
      )}

      <div className="auth-card" style={{ margin: 0, maxWidth: "none", display: "grid", gap: ".75rem" }}>
        <div style={{ fontWeight: 800 }}>Create a course</div>

        <label style={{ display: "grid", gap: ".25rem" }}>
          <span style={{ fontWeight: 700 }}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My Home Course" />
        </label>

        <label style={{ display: "grid", gap: ".25rem" }}>
          <span style={{ fontWeight: 700 }}>Holes</span>
          <select value={holesCount} onChange={(e) => setHolesCount(Number(e.target.value) as 9 | 18)}>
            <option value={9}>9</option>
            <option value={18}>18</option>
          </select>
        </label>

        <div className="auth-mono">Total par: {totalPar}</div>

        <div style={{ display: "grid", gap: ".5rem" }}>
          {holes.map((h, idx) => (
            <div
              key={h.number}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: ".75rem",
                alignItems: "center",
              }}
            >
              <div className="auth-mono">Hole {h.number}</div>
              <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={h.par}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setHoles((prev) => {
                      const next = [...prev];
                      next[idx] = { ...next[idx], par: Number.isFinite(v) && v > 0 ? v : next[idx].par };
                      return next;
                    });
                  }}
                  style={{ width: 90 }}
                  aria-label={`Hole ${h.number} par`}
                />
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={h.distance ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const v = raw === "" ? null : Number(raw);
                    setHoles((prev) => {
                      const next = [...prev];
                      next[idx] = { ...next[idx], distance: v != null && Number.isFinite(v) && v > 0 ? v : null };
                      return next;
                    });
                  }}
                  style={{ width: 110 }}
                  placeholder="Dist"
                  aria-label={`Hole ${h.number} distance`}
                />
                <select
                  value={h.hcp ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const v = raw === "" ? null : Number(raw);
                    setHoles((prev) => {
                      const next = [...prev];
                      next[idx] = { ...next[idx], hcp: v };
                      return next;
                    });
                  }}
                  style={{ width: 90 }}
                  aria-label={`Hole ${h.number} handicap`}
                >
                  <option value="">HCP</option>
                  {Array.from({ length: holesCount }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        <button className="auth-btn primary" disabled={!name.trim() || !!loading} onClick={() => void createCourse()}>
          Create course
        </button>
      </div>

      {!courses.length && !loading ? (
        <div className="auth-card">
          <div className="auth-mono">No courses yet.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: ".75rem" }}>
          {courses.map((c) => (
            <div key={c.id} className="auth-card" style={{ margin: 0, maxWidth: "none", padding: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{c.name}</div>
                  <div className="auth-mono">Holes: {c.holes.length} · Par {c.holes.reduce((acc, h) => acc + h.par, 0)}</div>
                </div>
                <button className="auth-btn secondary" disabled={!!loading} onClick={() => void deleteCourse(c.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
