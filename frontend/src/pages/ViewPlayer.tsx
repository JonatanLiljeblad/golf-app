import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApi } from "../api/useApi";
import type { Player } from "../api/types";

type ApiError = { status: number; body: unknown };

type PlayerStats = { rounds_count: number; avg_strokes: number | null };

function label(p: Player): string {
  return p.name || p.username || p.external_id;
}

export default function ViewPlayer() {
  const { externalId } = useParams();
  const { request } = useApi();

  const [player, setPlayer] = useState<Player | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!externalId) return;
      setApiError(null);
      setLoading(true);
      try {
        const [data, s] = await Promise.all([
          request<Player>(`/api/v1/players/${encodeURIComponent(externalId)}`),
          request<PlayerStats>(
            `/api/v1/players/${encodeURIComponent(externalId)}/stats`,
          ),
        ]);
        setPlayer(data);
        setStats(s);
      } catch (e) {
        const err = e as ApiError;
        setApiError(`Failed to load player (${err.status}).`);
      } finally {
        setLoading(false);
      }
    }

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalId]);

  if (!externalId) {
    return (
      <div className="page content-narrow">
        <div className="auth-card">
          <div className="auth-mono">Missing player id.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page content-narrow">
      {apiError && (
        <div className="auth-card">
          <div className="auth-mono">{apiError}</div>
        </div>
      )}

      <div className="auth-card">
        <div className="auth-row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 className="auth-title" style={{ marginBottom: ".25rem" }}>
              Player
            </h1>
            <p className="auth-subtitle">Read-only profile.</p>
          </div>
          <Link className="auth-btn secondary" to="/friends">
            Back
          </Link>
        </div>

        {loading && <div className="auth-mono">Loading…</div>}

        {!loading && player && (
          <div style={{ display: "grid", gap: ".5rem", marginTop: "1rem" }}>
            <div>
              <div style={{ fontWeight: 800 }}>{label(player)}</div>
              <div className="auth-mono">id: {player.external_id}</div>
            </div>

            <div className="auth-row" style={{ gap: "1.25rem" }}>
              <div>
                <div style={{ fontWeight: 700 }}>Username</div>
                <div className="auth-mono">{player.username ?? "—"}</div>
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>Name</div>
                <div className="auth-mono">{player.name ?? "—"}</div>
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>Handicap</div>
                <div className="auth-mono">{player.handicap ?? "—"}</div>
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>Rounds</div>
                <div className="auth-mono">{stats?.rounds_count ?? "—"}</div>
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>Avg strokes</div>
                <div className="auth-mono">
                  {stats?.avg_strokes == null
                    ? "—"
                    : stats.avg_strokes.toFixed(1)}
                </div>
              </div>
            </div>

            <div className="auth-mono" style={{ marginTop: ".5rem" }}>
              Email is hidden for privacy.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
