import { Link } from "react-router-dom";

export default function Header() {
  return (
    <header className="header">
      <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 28 }}>✨</span>
        <h1>SkinMatch</h1>
      </Link>
      <nav>
        <Link to="/analyze">Start analysis</Link>
      </nav>
    </header>
  );
}
