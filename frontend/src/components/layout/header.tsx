import { useAuth0 } from "@auth0/auth0-react";
import { Link } from "react-router-dom";

export default function Header() {
  const { isAuthenticated, loginWithRedirect, logout } = useAuth0();

  return (
    <header className="top-nav">
      <nav className="top-nav__links">
        <Link to="/">Home</Link>
        <Link to="/courses">Courses</Link>
        <Link to="/round/start">Start Round</Link>
        <Link to="/rounds">My Rounds</Link>
        <Link to="/profile">Profile</Link>
      </nav>

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
    </header>
  );
}
