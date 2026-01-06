import { Link } from "react-router-dom";

export default function Header() {
  return (
    <header style={{ padding: "1rem", borderBottom: "1px solid #ddd" }}>
      <nav style={{ display: "flex", gap: "1rem" }}>
        <Link to="/">Home</Link>
        <Link to="/round/start">Start Round</Link>
        <Link to="/profile">Profile</Link>
      </nav>
    </header>
  );
}