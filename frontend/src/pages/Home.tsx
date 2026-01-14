import { useAuth0 } from "@auth0/auth0-react";
import { Link } from "react-router-dom";

export default function Home() {
  const { isAuthenticated, loginWithRedirect, user } = useAuth0();

  const who = user?.name || user?.email || user?.nickname || user?.sub;

  return (
    <div className="auth-card panel content-narrow">
      <h1 className="auth-title">Golf App</h1>
      <p className="auth-subtitle">Track courses, start rounds, and fill in scorecards as you play.</p>

      {!isAuthenticated ? (
        <>
          <div className="auth-mono" style={{ marginBottom: ".75rem" }}>
            You need to log in before you can create courses or save rounds.
          </div>
          <button className="auth-btn primary" onClick={() => loginWithRedirect()}>
            Log in
          </button>
        </>
      ) : (
        <>
          <div className="auth-mono" style={{ marginBottom: ".75rem" }}>
            Logged in{who ? ` as ${who}` : ""}.
          </div>
          <div className="auth-row">
            <Link className="auth-btn primary" to="/round/start" style={{ display: "inline-block" }}>
              Start a round
            </Link>
            <Link className="auth-btn secondary" to="/courses" style={{ display: "inline-block" }}>
              Courses
            </Link>
            <Link className="auth-btn secondary" to="/rounds" style={{ display: "inline-block" }}>
              My rounds
            </Link>
          </div>
        </>
      )}

      <div style={{ marginTop: "1.25rem", display: "grid", gap: ".5rem" }}>
        <div style={{ fontWeight: 800 }}>How to use the app</div>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "grid", gap: ".25rem" }}>
          <li>
            <Link to="/courses">Courses</Link>: create your own 9/18-hole courses.
          </li>
          <li>
            <Link to="/round/start">Start Round</Link>: pick a course and start a new round.
          </li>
          <li>
            <Link to="/rounds">My Rounds</Link>: view in-progress and completed rounds.
          </li>
          <li>
            <Link to="/profile">Profile</Link>: set your name/handicap.
          </li>
        </ul>
      </div>
    </div>
  );
}
