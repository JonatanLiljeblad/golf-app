import { useAuth0 } from "@auth0/auth0-react";

export default function Profile() {
  const {
    isAuthenticated,
    isLoading,
    error,
    loginWithRedirect,
    logout,
    user,
  } = useAuth0();

  if (isLoading) return <div className="auth-card">Loading…</div>;

  if (error) {
    return (
      <div className="auth-card">
        <h1 className="auth-title">Auth Error</h1>
        <div className="auth-mono">{error.message}</div>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h1 className="auth-title">Profile</h1>
      <p className="auth-subtitle">
        Sign in with Auth0 to unlock your courses and rounds.
      </p>

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
    </div>
  );
}
