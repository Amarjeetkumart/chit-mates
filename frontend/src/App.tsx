import { NavLink, Route, Routes } from "react-router-dom";

import { HomePage } from "./routes/HomePage";
import { LobbyPage } from "./routes/LobbyPage";
import { GameBoardPage } from "./routes/GameBoardPage";
import { LeaderboardPage } from "./routes/LeaderboardPage";

export default function App() {
  return (
    <div className="app">
      <nav className="nav">
        <NavLink to="/" className="nav__logo">
          Chit Game
        </NavLink>
        <div className="nav__links">
          <NavLink to="/" className={({ isActive }) => (isActive ? "nav__link nav__link--active" : "nav__link")}>
            Home
          </NavLink>
          <NavLink
            to="/leaderboard"
            className={({ isActive }) => (isActive ? "nav__link nav__link--active" : "nav__link")}
          >
            Leaderboard
          </NavLink>
        </div>
      </nav>

      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/lobby/:roomCode" element={<LobbyPage />} />
          <Route path="/game/:gameId" element={<GameBoardPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="page">
      <header className="page__header">
        <h1>Page not found</h1>
        <p>The page you requested could not be located.</p>
      </header>
    </div>
  );
}
