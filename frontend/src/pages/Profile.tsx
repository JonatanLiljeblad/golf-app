import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useApi } from "../api/useApi";
import type { Player } from "../api/types";

type ApiError = { status: number; body: unknown };

function formatHandicapForInput(h: number | null): string {
  if (h == null) return "";
  // Stored as numeric where plus handicaps are negative (e.g. -0.1 => "+0.1").
  return h < 0 ? `+${Math.abs(h)}` : String(h);
}

function parseHandicapFromInput(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const v = Number(s.replace("+", ""));
  if (!Number.isFinite(v)) return null;
  return s.startsWith("+") ? -Math.abs(v) : v;
}

export default function Profile() {
  const {
    isAuthenticated,
    isLoading,
    error,
    loginWithRedirect,
    logout,
    user,
  } = useAuth0();
  const { request } = useApi();
  const location = useLocation();

  const [me, setMe] = useState<Player | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [handicap, setHandicap] = useState<string>("");
  const [gender, setGender] = useState<"men" | "women" | "">("");

  async function loadMe() {
    setApiError(null);
    setMsg(null);
    try {
      const data = await request<Player>("/api/v1/players/me");
      setMe(data);
      setEmail(data.email ?? "");
      setUsername(data.username ?? "");
      setName(data.name ?? "");
      setHandicap(formatHandicapForInput(data.handicap));
      setGender(data.gender ?? "");
    } catch (e) {
      const err = e as ApiError;
      setApiError(`Failed to load profile (${err.status}).`);
    }
  }

  async function saveMe() {
    setApiError(null);
    setMsg(null);
    setSaving(true);
    try {
      const h = parseHandicapFromInput(handicap);
      const updated = await request<Player>("/api/v1/players/me", {
        method: "PATCH",
        body: JSON.stringify({
          email: email.trim() || null,
          username: username.trim() || null,
          name: name.trim() || null,
          handicap: h,
          gender: gender || null,
        }),
      });
      setMe(updated);
      setMsg("Saved.");
    } catch (e) {
      const err = e as ApiError;
      const detail =
        err.body && typeof err.body === "object" && "detail" in err.body
          ? (err.body as { detail?: unknown }).detail
          : null;
      const m = detail != null ? String(detail) : null;
      setApiError(m ? `${m} (${err.status}).` : `Failed to save (${err.status}).`);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated) void loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (isLoading) return <div className="auth-card">Loading…</div>;

  if (error) {
    return (
      <div className="auth-card content-narrow">
        <h1 className="auth-title">Auth Error</h1>
        <div className="auth-mono">{error.message}</div>
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
      {msg && (
        <div className="auth-card">
          <div className="auth-mono">{msg}</div>
        </div>
      )}

      <div className="auth-card">
        <h1 className="auth-title">Profile</h1>
        <p className="auth-subtitle">Set your username/email so others can add you to a round.</p>
        {location.search.includes("required=1") && (
          <div className="auth-mono" style={{ marginTop: ".5rem" }}>
            Complete your profile (email + username) to continue.
          </div>
        )}

        <div className="auth-row">
          {!isAuthenticated ? (
            <button className="auth-btn primary" onClick={() => loginWithRedirect()}>
              Log in
            </button>
          ) : (
            <button
              className="auth-btn secondary"
              onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
            >
              Log out
            </button>
          )}
        </div>

        {isAuthenticated && user && (
          <div className="auth-user">
            <img className="auth-avatar" src={user.picture} alt={user.name ?? "User"} />
            <div>
              <div style={{ fontWeight: 800 }}>{user.name}</div>
              <div className="auth-mono">{user.email}</div>
              <div className="auth-mono">sub: {user.sub}</div>
            </div>
          </div>
        )}

        {isAuthenticated && me && (
          <div style={{ display: "grid", gap: ".5rem", marginTop: "1rem" }}>
            <div className="auth-row" style={{ gap: "1.25rem" }}>
              <div>
                <div style={{ fontWeight: 700 }}>Rounds</div>
                <div className="auth-mono">{me.rounds_count ?? "—"}</div>
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>Avg strokes</div>
                <div className="auth-mono">
                  {me.avg_strokes == null ? "—" : me.avg_strokes.toFixed(1)}
                </div>
              </div>
            </div>
            <label style={{ display: "grid", gap: ".25rem" }}>
              <span style={{ fontWeight: 700 }}>Email *</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label style={{ display: "grid", gap: ".25rem" }}>
              <span style={{ fontWeight: 700 }}>Username *</span>
              <input required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="yourname" />
            </label>
            <label style={{ display: "grid", gap: ".25rem" }}>
              <span style={{ fontWeight: 700 }}>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
            </label>
            <label style={{ display: "grid", gap: ".25rem" }}>
              <span style={{ fontWeight: 700 }}>Handicap</span>
              <input
                value={handicap}
                onChange={(e) => setHandicap(e.target.value)}
                placeholder="e.g. 12.4 or +0.1"
              />
            </label>
            <label style={{ display: "grid", gap: ".25rem" }}>
              <span style={{ fontWeight: 700 }}>Gender</span>
              <select value={gender} onChange={(e) => setGender(e.target.value as "men" | "women" | "")}>
                <option value="">—</option>
                <option value="men">Men</option>
                <option value="women">Women</option>
              </select>
            </label>

            <button
              className="auth-btn primary"
              onClick={() => void saveMe()}
              disabled={saving || !email.trim() || !username.trim()}
            >
              {saving ? "Saving…" : "Save profile"}
            </button>
            {(!email.trim() || !username.trim()) && (
              <div className="auth-mono">Email and username are required.</div>
            )}
          </div>
        )}
      </div>


    </div>
  );
}
