import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";

import { useApi } from "../api/useApi";
import type { TournamentInvite, TournamentSummary } from "../api/types";

type ApiError = { status: number; body: unknown };

export default function Tournaments() {
  const { isAuthenticated, loginWithRedirect } = useAuth0();
  const { request } = useApi();

  const [items, setItems] = useState<TournamentSummary[]>([]);
  const [invites, setInvites] = useState<TournamentInvite[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function acceptInvite(inviteId: number) {
    setError(null);
    try {
      await request(`/api/v1/tournaments/invites/${inviteId}/accept`, { method: "POST" });
      await load();
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to accept invite (${err.status}).`);
    }
  }

  async function declineInvite(inviteId: number) {
    setError(null);
    try {
      await request(`/api/v1/tournaments/invites/${inviteId}/decline`, { method: "POST" });
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

  if (!isAuthenticated) {
    return (
      <div className="auth-card content-narrow">
        <h1 className="auth-title">Tournaments</h1>
        <p className="auth-subtitle">Log in to view tournaments and leaderboards.</p>
        <button className="auth-btn primary" onClick={() => loginWithRedirect()}>
          Log in
        </button>
      </div>
    );
  }

  return (
    <div className="page content-narrow">
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Tournaments</h1>
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

      {!!invites.length && (
        <div className="auth-card" style={{ overflow: "hidden" }}>
          <div style={{ fontWeight: 800, marginBottom: ".5rem" }}>Invites</div>
          <div className="stack">
            {invites.map((i) => (
              <div key={i.id} className="auth-card" style={{ padding: "1rem", boxShadow: "none" }}>
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
                    <div className="auth-mono" style={{ wordBreak: "break-word" }}>
                      From: {i.requester_name}
                    </div>
                  </div>
                  <div className="auth-row" style={{ flexShrink: 0 }}>
                    <button className="auth-btn primary" onClick={() => void acceptInvite(i.id)}>
                      Accept
                    </button>
                    <button className="auth-btn secondary" onClick={() => void declineInvite(i.id)}>
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
          <div className="auth-mono" style={{ marginTop: ".5rem" }}>
            Create one from <Link to="/round/start">Start Round</Link>.
          </div>
        </div>
      ) : (
        <div className="stack">
          {items.map((t) => (
            <div key={t.id} className="auth-card" style={{ padding: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{t.name}</div>
                  <div className="auth-mono">
                    {t.course_name} · {t.is_public ? "Public" : "Private"} · Groups: {t.groups_count}
                  </div>
                </div>
                <Link className="auth-btn secondary" to={`/tournaments/${t.id}`}>
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
