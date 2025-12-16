import { NavLink, Route, Routes } from "react-router-dom";
import clsx from "clsx";

import { HomePage } from "./routes/HomePage";
import { LobbyPage } from "./routes/LobbyPage";
import { GameBoardPage } from "./routes/GameBoardPage";
import { LeaderboardPage } from "./routes/LeaderboardPage";

export default function App() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-56 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-sky-500/35 blur-3xl mix-blend-screen" />
        <div className="absolute bottom-[-18rem] left-0 h-[26rem] w-[26rem] rounded-full bg-rose-500/25 blur-3xl mix-blend-screen" />
        <div className="absolute right-[-12rem] top-1/3 h-[22rem] w-[22rem] rounded-full bg-purple-500/20 blur-3xl mix-blend-screen" />
      </div>

      <nav className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <NavLink to="/" className="text-xl font-semibold tracking-tight text-white">
            Chit Game
          </NavLink>
          <div className="flex items-center gap-2">
            <NavLink
              to="/"
              className={({ isActive }) =>
                clsx(
                  "rounded-full px-4 py-2 text-sm font-semibold transition", 
                  isActive
                    ? "bg-sky-500 text-white shadow-glow"
                    : "text-slate-200 hover:text-white hover:bg-slate-800/70"
                )
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/leaderboard"
              className={({ isActive }) =>
                clsx(
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  isActive
                    ? "bg-sky-500 text-white shadow-glow"
                    : "text-slate-200 hover:text-white hover:bg-slate-800/70"
                )
              }
            >
              Leaderboard
            </NavLink>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 pb-16 pt-10">
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
    <div className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Page not found</h1>
        <p className="text-slate-400">The page you requested could not be located.</p>
      </header>
    </div>
  );
}
