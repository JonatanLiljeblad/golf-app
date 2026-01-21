import { useEffect, useMemo, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";

import { useApi } from "../api/useApi";
import type { Course } from "../api/types";

type ApiError = { status: number; body: unknown };

type TeeDraft = {
  tee_name: string;
  course_rating: string;
  slope_rating: string;
  hole_distances: (number | null)[];
};

function mkHoles(count: 9 | 18) {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    par: 4,
    distance: null as number | null,
    hcp: null as number | null,
  }));
}

function mkTee(count: 9 | 18, tee_name = "White"): TeeDraft {
  return {
    tee_name,
    course_rating: "",
    slope_rating: "",
    hole_distances: Array.from({ length: count }, () => null),
  };
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
  const [tees, setTees] = useState<TeeDraft[]>(() => [mkTee(9)]);
  const [selectedTeeIdx, setSelectedTeeIdx] = useState(0);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  useEffect(() => {
    setHoles(mkHoles(holesCount));
    setTees([mkTee(holesCount)]);
    setSelectedTeeIdx(0);
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

  const canCreate = useMemo(() => {
    if (!name.trim()) return false;
    if (!tees.length) return false;

    const names = tees.map((t) => t.tee_name.trim());
    if (names.some((n) => !n)) return false;
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) return false;

    for (const t of tees) {
      const cr = Number(t.course_rating);
      const sr = Number(t.slope_rating);
      if (!Number.isFinite(cr)) return false;
      if (!Number.isInteger(sr)) return false;
      if (t.hole_distances.length !== holesCount) return false;
      if (t.hole_distances.some((d) => d == null || !Number.isFinite(d) || d <= 0)) return false;
    }

    return true;
  }, [holesCount, name, tees]);

  async function createCourse() {
    const trimmed = name.trim();
    if (!trimmed) return;

    setError(null);
    setLoading("Creating course…");
    try {
      const payload = {
        name: trimmed,
        holes: holes.map((h) => ({ number: h.number, par: h.par, hcp: h.hcp, distance: null })),
        tees: tees.map((t) => ({
          tee_name: t.tee_name.trim(),
          course_rating: Number(t.course_rating),
          slope_rating: Number(t.slope_rating),
          hole_distances: t.hole_distances.map((d, i) => ({ hole_number: i + 1, distance: d as number })),
        })),
      };

      const created = await request<Course>("/api/v1/courses", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCourses((prev) => [...prev, created]);
      setName("");
      setHoles(mkHoles(holesCount));
      setTees([mkTee(holesCount)]);
      setSelectedTeeIdx(0);
      setCreateModalOpen(false);
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
      <div className="auth-card content-narrow">
        <h1 className="auth-title">Courses</h1>
        <p className="auth-subtitle">Log in to create and manage your courses.</p>
        <button className="auth-btn primary" onClick={() => loginWithRedirect()}>
          Log in
        </button>
      </div>
    );
  }

  return (
    <div className="page content-narrow">
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Courses</h1>
        <div className="auth-row" style={{ gap: ".5rem" }}>
          <button
            className="auth-btn primary"
            onClick={() => {
              setError(null);
              setCreateModalOpen(true);
            }}
          >
            Create course
          </button>
          <button className="auth-btn secondary" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>

      {loading && <div className="auth-mono">{loading}</div>}

      {error && (
        <div className="auth-card">
          <div className="auth-mono">{error}</div>
        </div>
      )}

      {createModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setCreateModalOpen(false)}>
          <div className="auth-card modal-card modal-card--wide" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
              <div style={{ fontWeight: 900 }}>Create course</div>
              <button className="auth-btn secondary" style={{ padding: ".45rem .7rem" }} onClick={() => setCreateModalOpen(false)}>
                Close
              </button>
            </div>

            <div className="course-create" style={{ marginTop: ".75rem" }}>
              <label style={{ display: "grid", gap: ".25rem" }}>
                <span style={{ fontWeight: 700 }}>Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My Home Course" />
              </label>

              <div className="auth-row" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: ".75rem" }}>
                <label style={{ display: "grid", gap: ".25rem", minWidth: 140 }}>
                  <span style={{ fontWeight: 700 }}>Holes</span>
                  <select value={holesCount} onChange={(e) => setHolesCount(Number(e.target.value) as 9 | 18)}>
                    <option value={9}>9</option>
                    <option value={18}>18</option>
                  </select>
                </label>
                <div className="auth-mono">Total par: {totalPar}</div>
              </div>

              <div className="course-holes-scroll">
                <div className="course-holes">
                  {holes.map((h, idx) => (
                    <div
                      key={h.number}
                      className="course-hole"
                      style={{ gridTemplateColumns: "38px repeat(2, minmax(0, 1fr))" }}
                    >
                    <div className="course-hole__num">{h.number}</div>

                    <label style={{ display: "grid", gap: ".25rem" }}>
                      <span className="auth-mono">Par</span>
                      <select
                        value={h.par}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setHoles((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], par: v };
                            return next;
                          });
                        }}
                        aria-label={`Hole ${h.number} par`}
                      >
                        {[3, 4, 5].map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={{ display: "grid", gap: ".25rem" }}>
                      <span className="auth-mono">HCP</span>
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
                        aria-label={`Hole ${h.number} handicap`}
                      >
                        <option value="">—</option>
                        {Array.from({ length: holesCount }, (_, i) => i + 1).map((n) => {
                          const usedElsewhere = holes.some((x, j) => j !== idx && x.hcp === n);
                          return (
                            <option key={n} value={n} disabled={usedElsewhere}>
                              {n}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gap: ".5rem" }}>
                <div className="auth-row" style={{ justifyContent: "space-between", alignItems: "center", gap: ".75rem" }}>
                  <div style={{ fontWeight: 800 }}>Tees</div>
                  <button
                    className="auth-btn secondary"
                    style={{ padding: ".45rem .7rem" }}
                    onClick={() => {
                      setTees((prev) => [...prev, mkTee(holesCount, `Tee ${prev.length + 1}`)]);
                      setSelectedTeeIdx(tees.length);
                    }}
                    type="button"
                  >
                    Add tee
                  </button>
                </div>

                <div className="auth-row" style={{ gap: ".5rem", flexWrap: "wrap" }}>
                  {tees.map((t, idx) => (
                    <button
                      key={`${t.tee_name}-${idx}`}
                      className={`auth-btn ${idx === selectedTeeIdx ? "primary" : "secondary"}`}
                      style={{ padding: ".45rem .7rem" }}
                      onClick={() => setSelectedTeeIdx(idx)}
                      type="button"
                    >
                      {t.tee_name.trim() || `Tee ${idx + 1}`}
                    </button>
                  ))}
                </div>

                {tees[selectedTeeIdx] && (
                  <div style={{ display: "grid", gap: ".6rem" }}>
                    <div
                      className="auth-row"
                      style={{ justifyContent: "space-between", gap: ".75rem", alignItems: "end", flexWrap: "wrap" }}
                    >
                      <label style={{ display: "grid", gap: ".25rem", minWidth: 180, flex: 1 }}>
                        <span style={{ fontWeight: 700 }}>Tee name</span>
                        <input
                          value={tees[selectedTeeIdx].tee_name}
                          onChange={(e) => {
                            const v = e.target.value;
                            setTees((prev) => {
                              const next = [...prev];
                              next[selectedTeeIdx] = { ...next[selectedTeeIdx], tee_name: v };
                              return next;
                            });
                          }}
                          placeholder="e.g. White"
                        />
                      </label>

                      <label style={{ display: "grid", gap: ".25rem", minWidth: 140 }}>
                        <span style={{ fontWeight: 700 }}>Course rating</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          value={tees[selectedTeeIdx].course_rating}
                          onChange={(e) => {
                            const v = e.target.value;
                            setTees((prev) => {
                              const next = [...prev];
                              next[selectedTeeIdx] = { ...next[selectedTeeIdx], course_rating: v };
                              return next;
                            });
                          }}
                          placeholder="72.0"
                        />
                      </label>

                      <label style={{ display: "grid", gap: ".25rem", minWidth: 120 }}>
                        <span style={{ fontWeight: 700 }}>Slope</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          step="1"
                          value={tees[selectedTeeIdx].slope_rating}
                          onChange={(e) => {
                            const v = e.target.value;
                            setTees((prev) => {
                              const next = [...prev];
                              next[selectedTeeIdx] = { ...next[selectedTeeIdx], slope_rating: v };
                              return next;
                            });
                          }}
                          placeholder="113"
                        />
                      </label>

                      {tees.length > 1 && (
                        <button
                          className="auth-btn secondary"
                          style={{ padding: ".45rem .7rem", alignSelf: "end" }}
                          onClick={() => {
                            setTees((prev) => prev.filter((_, i) => i !== selectedTeeIdx));
                            setSelectedTeeIdx((i) => Math.max(0, Math.min(i, tees.length - 2)));
                          }}
                          type="button"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="course-holes-scroll">
                      <div className="course-holes">
                        {tees[selectedTeeIdx].hole_distances.map((d, holeIdx) => (
                          <div key={holeIdx} className="tee-hole">
                            <div className="course-hole__num">{holeIdx + 1}</div>
                            <label style={{ display: "grid", gap: ".25rem" }}>
                              <span className="auth-mono">Distance</span>
                              <input
                                type="number"
                                min={1}
                                max={2000}
                                value={d ?? ""}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const v = raw === "" ? null : Number(raw);
                                  setTees((prev) => {
                                    const next = [...prev];
                                    const tee = next[selectedTeeIdx];
                                    const hd = [...tee.hole_distances];
                                    hd[holeIdx] = v != null && Number.isFinite(v) && v > 0 ? v : null;
                                    next[selectedTeeIdx] = { ...tee, hole_distances: hd };
                                    return next;
                                  });
                                }}
                                placeholder="yd"
                                aria-label={`Tee ${tees[selectedTeeIdx].tee_name} hole ${holeIdx + 1} distance`}
                              />
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="auth-row" style={{ justifyContent: "space-between", marginTop: ".75rem" }}>
                <button className="auth-btn secondary" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </button>
                <button className="auth-btn primary" disabled={!canCreate || !!loading} onClick={() => void createCourse()}>
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
