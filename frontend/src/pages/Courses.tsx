import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";

import { useApi } from "../api/useApi";
import type { Course } from "../api/types";

type ApiError = { status: number; body: unknown };

type TeeDraft = {
  id?: number | null;
  tee_name: string;
  course_rating_men: string;
  slope_rating_men: string;
  course_rating_women: string;
  slope_rating_women: string;
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
    id: null,
    tee_name,
    course_rating_men: "",
    slope_rating_men: "",
    course_rating_women: "",
    slope_rating_women: "",
    hole_distances: Array.from({ length: count }, () => null),
  };
}

export default function Courses() {
  const { isAuthenticated, loginWithRedirect, user } = useAuth0();
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
  const [createStep, setCreateStep] = useState<1 | 2>(1);

  const [editingCourseId, setEditingCourseId] = useState<number | null>(null);
  const skipResetRef = useRef(false);

  useEffect(() => {
    if (skipResetRef.current) {
      skipResetRef.current = false;
      return;
    }
    setHoles(mkHoles(holesCount));
    setTees([mkTee(holesCount)]);
    setSelectedTeeIdx(0);
  }, [holesCount]);

  const totalPar = useMemo(
    () => holes.reduce((acc, h) => acc + h.par, 0),
    [holes],
  );

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

  const step1Valid = useMemo(() => {
    if (!name.trim()) return false;
    if (!holes.length) return false;

    const hcps = holes.map((h) => h.hcp);
    if (hcps.some((h) => h == null)) return false;
    if (new Set(hcps as number[]).size !== holes.length) return false;

    return true;
  }, [holes, name]);

  const canCreate = useMemo(() => {
    if (!step1Valid) return false;
    if (!tees.length) return false;

    const names = tees.map((t) => t.tee_name.trim());
    if (names.some((n) => !n)) return false;
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length)
      return false;

    for (const t of tees) {
      const crMen = Number(t.course_rating_men);
      const srMen = Number(t.slope_rating_men);
      const crWomen = Number(t.course_rating_women);
      const srWomen = Number(t.slope_rating_women);
      if (!Number.isFinite(crMen)) return false;
      if (!Number.isInteger(srMen)) return false;
      if (!Number.isFinite(crWomen)) return false;
      if (!Number.isInteger(srWomen)) return false;
      if (t.hole_distances.length !== holesCount) return false;
      if (
        t.hole_distances.some((d) => d == null || !Number.isFinite(d) || d <= 0)
      )
        return false;
    }

    return true;
  }, [holesCount, step1Valid, tees]);

  function mkPayload(trimmedName: string) {
    return {
      name: trimmedName,
      holes: holes.map((h) => ({
        number: h.number,
        par: h.par,
        hcp: h.hcp,
        distance: null,
      })),
      tees: tees.map((t) => ({
        id: t.id ?? null,
        tee_name: t.tee_name.trim(),
        course_rating_men: Number(t.course_rating_men),
        slope_rating_men: Number(t.slope_rating_men),
        course_rating_women: Number(t.course_rating_women),
        slope_rating_women: Number(t.slope_rating_women),
        // legacy fields (backwards compatibility)
        course_rating: Number(t.course_rating_men),
        slope_rating: Number(t.slope_rating_men),
        hole_distances: t.hole_distances.map((d, i) => ({
          hole_number: i + 1,
          distance: d as number,
        })),
      })),
    };
  }

  async function createCourse() {
    const trimmed = name.trim();
    if (!trimmed) return;

    setError(null);
    setLoading("Creating course…");
    try {
      const created = await request<Course>("/api/v1/courses", {
        method: "POST",
        body: JSON.stringify(mkPayload(trimmed)),
      });
      setCourses((prev) => [...prev, created]);
      setName("");
      setHoles(mkHoles(holesCount));
      setTees([mkTee(holesCount)]);
      setSelectedTeeIdx(0);
      setCreateStep(1);
      setEditingCourseId(null);
      setCreateModalOpen(false);
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to create course (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  async function updateCourse(courseId: number) {
    const trimmed = name.trim();
    if (!trimmed) return;

    setError(null);
    setLoading("Saving course…");
    try {
      const updated = await request<Course>(`/api/v1/courses/${courseId}`, {
        method: "PUT",
        body: JSON.stringify(mkPayload(trimmed)),
      });
      setCourses((prev) => prev.map((c) => (c.id === courseId ? updated : c)));
      setEditingCourseId(null);
      setCreateModalOpen(false);
      setCreateStep(1);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 403)
        setError("You can only edit courses you created.");
      else setError(`Failed to save course (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  function courseToDraft(course: Course) {
    setName(course.name);
    const count = (course.holes.length === 18 ? 18 : 9) as 9 | 18;
    skipResetRef.current = true;
    setHolesCount(count);
    setHoles(
      course.holes.map((h) => ({
        number: h.number,
        par: h.par,
        distance: null as number | null,
        hcp: h.hcp,
      })),
    ); // distance unused in UI

    const teesFromApi = course.tees ?? [];
    if (teesFromApi.length) {
      setTees(
        teesFromApi.map((t) => {
          const byHole = new Map(
            t.hole_distances.map((d) => [d.hole_number, d.distance] as const),
          );
          return {
            id: t.id,
            tee_name: t.tee_name,
            course_rating_men: String(
              t.course_rating_men ?? t.course_rating ?? "",
            ),
            slope_rating_men: String(
              t.slope_rating_men ?? t.slope_rating ?? "",
            ),
            course_rating_women: String(t.course_rating_women ?? ""),
            slope_rating_women: String(t.slope_rating_women ?? ""),
            hole_distances: Array.from(
              { length: count },
              (_, i) => byHole.get(i + 1) ?? null,
            ),
          };
        }),
      );
      setSelectedTeeIdx(0);
    } else {
      setTees([mkTee(count)]);
      setSelectedTeeIdx(0);
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
      if (err.status === 403)
        setError("You can only delete courses you created.");
      else if (err.status === 409)
        setError("Cannot delete: course has active rounds.");
      else setError(`Failed to delete course (${err.status}).`);
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
        <p className="auth-subtitle">
          Log in to create and manage your courses.
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
        <h1 style={{ margin: 0 }}>Courses</h1>
        <div className="auth-row" style={{ gap: ".5rem" }}>
          <button
            className="auth-btn primary"
            onClick={() => {
              setError(null);
              setEditingCourseId(null);
              setName("");
              setHolesCount(9);
              setCreateStep(1);
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
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setCreateModalOpen(false);
            setCreateStep(1);
            setEditingCourseId(null);
          }}
        >
          <div
            className="auth-card modal-card modal-card--wide"
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
              <div style={{ fontWeight: 900 }}>
                {editingCourseId ? "Edit course" : "Create course"} · Step{" "}
                {createStep} / 2
              </div>
              <button
                className="auth-btn secondary"
                style={{ padding: ".45rem .7rem" }}
                onClick={() => {
                  setCreateModalOpen(false);
                  setCreateStep(1);
                }}
              >
                Close
              </button>
            </div>

            <div className="course-create" style={{ marginTop: ".75rem" }}>
              {createStep === 1 && (
                <>
                  <label style={{ display: "grid", gap: ".25rem" }}>
                    <span style={{ fontWeight: 700 }}>Name</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. My Home Course"
                    />
                  </label>

                  <div
                    className="auth-row"
                    style={{
                      justifyContent: "space-between",
                      alignItems: "flex-end",
                      gap: ".75rem",
                    }}
                  >
                    <label
                      style={{ display: "grid", gap: ".25rem", minWidth: 140 }}
                    >
                      <span style={{ fontWeight: 700 }}>Holes</span>
                      <select
                        value={holesCount}
                        onChange={(e) =>
                          setHolesCount(Number(e.target.value) as 9 | 18)
                        }
                      >
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
                          style={{
                            gridTemplateColumns:
                              "38px repeat(2, minmax(0, 1fr))",
                          }}
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
                              {Array.from(
                                { length: holesCount },
                                (_, i) => i + 1,
                              ).map((n) => {
                                const usedElsewhere = holes.some(
                                  (x, j) => j !== idx && x.hcp === n,
                                );
                                return (
                                  <option
                                    key={n}
                                    value={n}
                                    disabled={usedElsewhere}
                                  >
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

                  <div
                    className="auth-row"
                    style={{
                      justifyContent: "space-between",
                      marginTop: ".75rem",
                    }}
                  >
                    <button
                      className="auth-btn secondary"
                      onClick={() => {
                        setCreateModalOpen(false);
                        setCreateStep(1);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="auth-btn primary"
                      disabled={!step1Valid}
                      onClick={() => setCreateStep(2)}
                    >
                      Next
                    </button>
                  </div>
                </>
              )}

              {createStep === 2 && (
                <>
                  <div style={{ display: "grid", gap: ".5rem" }}>
                    <div
                      className="auth-row"
                      style={{
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: ".75rem",
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>Tees</div>
                      <button
                        className="auth-btn secondary"
                        style={{ padding: ".45rem .7rem" }}
                        onClick={() => {
                          setTees((prev) => [
                            ...prev,
                            mkTee(holesCount, `Tee ${prev.length + 1}`),
                          ]);
                          setSelectedTeeIdx(tees.length);
                        }}
                        type="button"
                      >
                        Add tee
                      </button>
                    </div>

                    <div
                      className="auth-row"
                      style={{ gap: ".5rem", flexWrap: "wrap" }}
                    >
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
                        <label style={{ display: "grid", gap: ".25rem" }}>
                          <span style={{ fontWeight: 700 }}>Tee name</span>
                          <input
                            value={tees[selectedTeeIdx].tee_name}
                            onChange={(e) => {
                              const v = e.target.value;
                              setTees((prev) => {
                                const next = [...prev];
                                next[selectedTeeIdx] = {
                                  ...next[selectedTeeIdx],
                                  tee_name: v,
                                };
                                return next;
                              });
                            }}
                            placeholder="e.g. White"
                          />
                        </label>

                        <div
                          style={{
                            display: "grid",
                            gap: ".5rem",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(180px, 1fr))",
                          }}
                        >
                          <div
                            className="card-inset"
                            style={{ padding: ".75rem" }}
                          >
                            <div
                              style={{
                                fontWeight: 800,
                                marginBottom: ".35rem",
                              }}
                            >
                              Men
                            </div>
                            <div style={{ display: "grid", gap: ".5rem" }}>
                              <label style={{ display: "grid", gap: ".25rem" }}>
                                <span className="auth-mono">Course rating</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  step="0.1"
                                  value={tees[selectedTeeIdx].course_rating_men}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setTees((prev) => {
                                      const next = [...prev];
                                      next[selectedTeeIdx] = {
                                        ...next[selectedTeeIdx],
                                        course_rating_men: v,
                                      };
                                      return next;
                                    });
                                  }}
                                  placeholder="72.0"
                                />
                              </label>

                              <label style={{ display: "grid", gap: ".25rem" }}>
                                <span className="auth-mono">Slope</span>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  step="1"
                                  value={tees[selectedTeeIdx].slope_rating_men}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setTees((prev) => {
                                      const next = [...prev];
                                      next[selectedTeeIdx] = {
                                        ...next[selectedTeeIdx],
                                        slope_rating_men: v,
                                      };
                                      return next;
                                    });
                                  }}
                                  placeholder="113"
                                />
                              </label>
                            </div>
                          </div>

                          <div
                            className="card-inset"
                            style={{ padding: ".75rem" }}
                          >
                            <div
                              style={{
                                fontWeight: 800,
                                marginBottom: ".35rem",
                              }}
                            >
                              Women
                            </div>
                            <div style={{ display: "grid", gap: ".5rem" }}>
                              <label style={{ display: "grid", gap: ".25rem" }}>
                                <span className="auth-mono">Course rating</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  step="0.1"
                                  value={
                                    tees[selectedTeeIdx].course_rating_women
                                  }
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setTees((prev) => {
                                      const next = [...prev];
                                      next[selectedTeeIdx] = {
                                        ...next[selectedTeeIdx],
                                        course_rating_women: v,
                                      };
                                      return next;
                                    });
                                  }}
                                  placeholder="72.0"
                                />
                              </label>

                              <label style={{ display: "grid", gap: ".25rem" }}>
                                <span className="auth-mono">Slope</span>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  step="1"
                                  value={
                                    tees[selectedTeeIdx].slope_rating_women
                                  }
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setTees((prev) => {
                                      const next = [...prev];
                                      next[selectedTeeIdx] = {
                                        ...next[selectedTeeIdx],
                                        slope_rating_women: v,
                                      };
                                      return next;
                                    });
                                  }}
                                  placeholder="113"
                                />
                              </label>
                            </div>
                          </div>
                        </div>

                        {tees.length > 1 && (
                          <button
                            className="auth-btn secondary"
                            style={{
                              padding: ".45rem .7rem",
                              justifySelf: "start",
                            }}
                            onClick={() => {
                              setTees((prev) =>
                                prev.filter((_, i) => i !== selectedTeeIdx),
                              );
                              setSelectedTeeIdx((i) =>
                                Math.max(0, Math.min(i, tees.length - 2)),
                              );
                            }}
                            type="button"
                          >
                            Remove tee
                          </button>
                        )}

                        <div className="course-holes-scroll">
                          <div className="course-holes">
                            {tees[selectedTeeIdx].hole_distances.map(
                              (d, holeIdx) => (
                                <div key={holeIdx} className="tee-hole">
                                  <div className="course-hole__num">
                                    {holeIdx + 1}
                                  </div>
                                  <label
                                    style={{ display: "grid", gap: ".25rem" }}
                                  >
                                    <span className="auth-mono">Distance</span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={2000}
                                      value={d ?? ""}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        const v =
                                          raw === "" ? null : Number(raw);
                                        setTees((prev) => {
                                          const next = [...prev];
                                          const tee = next[selectedTeeIdx];
                                          const hd = [...tee.hole_distances];
                                          hd[holeIdx] =
                                            v != null &&
                                            Number.isFinite(v) &&
                                            v > 0
                                              ? v
                                              : null;
                                          next[selectedTeeIdx] = {
                                            ...tee,
                                            hole_distances: hd,
                                          };
                                          return next;
                                        });
                                      }}
                                      placeholder="yd"
                                      aria-label={`Tee ${tees[selectedTeeIdx].tee_name} hole ${holeIdx + 1} distance`}
                                    />
                                  </label>
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div
                    className="auth-row"
                    style={{
                      justifyContent: "space-between",
                      marginTop: ".75rem",
                    }}
                  >
                    <button
                      className="auth-btn secondary"
                      onClick={() => setCreateStep(1)}
                    >
                      Back
                    </button>
                    <button
                      className="auth-btn primary"
                      disabled={!canCreate || !!loading}
                      onClick={() =>
                        editingCourseId
                          ? void updateCourse(editingCourseId)
                          : void createCourse()
                      }
                    >
                      {editingCourseId ? "Save" : "Create"}
                    </button>
                  </div>
                </>
              )}
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
            <div
              key={c.id}
              className="auth-card"
              style={{ margin: 0, maxWidth: "none", padding: "1rem" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                }}
              >
                <div>
                  <div style={{ fontWeight: 800 }}>{c.name}</div>
                  <div className="auth-mono">
                    Holes: {c.holes.length} · Par{" "}
                    {c.holes.reduce((acc, h) => acc + h.par, 0)}
                  </div>
                </div>
                {user?.sub === c.owner_id ? (
                  <div className="auth-row" style={{ gap: ".5rem" }}>
                    <button
                      className="auth-btn secondary"
                      disabled={!!loading}
                      onClick={() => {
                        setError(null);
                        setEditingCourseId(c.id);
                        courseToDraft(c);
                        setCreateStep(1);
                        setCreateModalOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="auth-btn secondary"
                      disabled={!!loading}
                      onClick={() => void deleteCourse(c.id)}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
