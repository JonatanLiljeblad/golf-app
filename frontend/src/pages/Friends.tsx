import { useEffect, useMemo, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useApi } from "../api/useApi";
import type { Player } from "../api/types";

type ApiError = { status: number; body: unknown };

type FriendRequest = { id: number; from_player: Player };

function label(p: Player): string {
  return p.name || p.username || p.email || p.external_id;
}

export default function Friends() {
  const { isAuthenticated, loginWithRedirect } = useAuth0();
  const { request } = useApi();

  const [friends, setFriends] = useState<Player[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [activeTab, setActiveTab] = useState<"friends" | "requests">("friends");

  const [q, setQ] = useState("");
  const [results, setResults] = useState<Player[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const friendIds = useMemo(() => new Set(friends.map((f) => f.external_id)), [friends]);

  async function loadFriends() {
    try {
      const data = await request<Player[]>("/api/v1/friends");
      setFriends(data);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 503) {
        setError("Friends feature needs DB migration (run: cd backend && alembic upgrade head)");
      }
    }
  }

  async function loadRequests() {
    try {
      const data = await request<FriendRequest[]>("/api/v1/friends/requests");
      setRequests(data);
    } catch {
      // ignore
    }
  }

  async function search() {
    const needle = q.trim();
    if (!needle) {
      setResults([]);
      return;
    }

    setError(null);
    setMsg(null);
    setLoading("Searching…");
    try {
      const data = await request<Player[]>(`/api/v1/players?q=${encodeURIComponent(needle)}`);
      setResults(data);
      if (!data.length) {
        setMsg("No users found with that information.");
      } else {
        setMsg(null);
      }
    } catch (e) {
      const err = e as ApiError;
      setError(`Search failed (${err.status}).`);
    } finally {
      setLoading(null);
    }
  }

  async function sendRequest(ref: string) {
    setError(null);
    setMsg(null);
    try {
      const res = await request<{ ok: boolean; accepted?: boolean }>("/api/v1/friends/requests", {
        method: "POST",
        body: JSON.stringify({ ref }),
      });
      setMsg(res.accepted ? "Friend request accepted." : "Friend request sent.");
      await Promise.all([loadFriends(), loadRequests()]);
    } catch (e) {
      const err = e as ApiError;
      const detail = err.body && typeof err.body === "object" && "detail" in err.body ? (err.body as { detail?: unknown }).detail : null;
      const msg = detail != null ? String(detail) : null;
      setError(msg ? `${msg} (${err.status}).` : `Failed to send request (${err.status}).`);
    }
  }

  async function removeFriend(externalId: string) {
    setError(null);
    setMsg(null);
    try {
      await request(`/api/v1/friends/${encodeURIComponent(externalId)}`, { method: "DELETE" });
      setMsg("Removed friend.");
      await loadFriends();
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to remove friend (${err.status}).`);
    }
  }

  async function acceptRequest(id: number) {
    setError(null);
    setMsg(null);
    try {
      await request(`/api/v1/friends/requests/${id}/accept`, { method: "POST" });
      setMsg("Friend request accepted.");
      await Promise.all([loadFriends(), loadRequests()]);
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to accept request (${err.status}).`);
    }
  }

  async function declineRequest(id: number) {
    setError(null);
    setMsg(null);
    try {
      await request(`/api/v1/friends/requests/${id}/decline`, { method: "POST" });
      setMsg("Friend request declined.");
      await loadRequests();
    } catch (e) {
      const err = e as ApiError;
      setError(`Failed to decline request (${err.status}).`);
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      void loadFriends();
      void loadRequests();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="auth-card">
        <h1 className="auth-title">Friends</h1>
        <p className="auth-subtitle">Log in to find and add friends.</p>
        <button className="auth-btn primary" onClick={() => loginWithRedirect()}>
          Log in
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: 720 }}>
      {error && (
        <div className="auth-card">
          <div className="auth-mono">{error}</div>
        </div>
      )}
      {msg && (
        <div className="auth-card">
          <div className="auth-mono">{msg}</div>
        </div>
      )}

      <div className="auth-card" style={{ display: "grid", gap: ".75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
          <div>
            <h1 className="auth-title" style={{ marginBottom: ".25rem" }}>Friends</h1>
            <p className="auth-subtitle">Search for users and send friend requests.</p>
          </div>
          <div className="auth-row">
            <button
              className={activeTab === "friends" ? "auth-btn primary" : "auth-btn secondary"}
              onClick={() => setActiveTab("friends")}
            >
              Friends
            </button>
            <button
              className={activeTab === "requests" ? "auth-btn primary" : "auth-btn secondary"}
              onClick={() => setActiveTab("requests")}
            >
              Friend requests{requests.length ? ` (${requests.length})` : ""}
            </button>
          </div>
        </div>

        {activeTab === "friends" ? (
          <>
            <div style={{ display: "grid", gap: ".5rem" }}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, username, email, or Auth0 id"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void search();
                }}
              />
              <button className="auth-btn secondary" onClick={() => void search()} disabled={!!loading}>
                {loading ?? "Search"}
              </button>
            </div>

            {!!results.length && (
              <div style={{ display: "grid", gap: ".5rem" }}>
                <div style={{ fontWeight: 800 }}>Results</div>
                {results.map((p) => (
                  <div key={p.external_id} className="auth-row" style={{ justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{label(p)}</div>
                      <div className="auth-mono">{p.email ?? p.username ?? p.external_id}</div>
                    </div>
                    <button
                      className="auth-btn primary"
                      disabled={friendIds.has(p.external_id)}
                      onClick={() => void sendRequest(p.external_id)}
                    >
                      {friendIds.has(p.external_id) ? "Friends" : "Send request"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "grid", gap: ".5rem" }}>
            <div style={{ fontWeight: 800 }}>Incoming requests</div>
            {!requests.length ? (
              <div className="auth-mono">No pending friend requests.</div>
            ) : (
              requests.map((r) => (
                <div key={r.id} className="auth-row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{label(r.from_player)}</div>
                    <div className="auth-mono">{r.from_player.email ?? r.from_player.username ?? r.from_player.external_id}</div>
                  </div>
                  <div className="auth-row">
                    <button className="auth-btn primary" onClick={() => void acceptRequest(r.id)}>
                      Accept
                    </button>
                    <button className="auth-btn secondary" onClick={() => void declineRequest(r.id)}>
                      Decline
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="auth-card" style={{ display: "grid", gap: ".75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800 }}>Your friends</div>
            <div className="auth-mono">Used for the friend picker when starting a round.</div>
          </div>
          <button className="auth-btn secondary" onClick={() => void loadFriends()}>
            Refresh
          </button>
        </div>

        {!friends.length ? (
          <div className="auth-mono">No friends yet.</div>
        ) : (
          <div style={{ display: "grid", gap: ".5rem" }}>
            {friends.map((f) => (
              <div key={f.external_id} className="auth-row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{label(f)}</div>
                  <div className="auth-mono">{f.email ?? f.username ?? f.external_id}</div>
                </div>
                <button className="auth-btn secondary" onClick={() => void removeFriend(f.external_id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
