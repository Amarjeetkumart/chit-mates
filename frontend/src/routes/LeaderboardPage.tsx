import { useQuery } from "@tanstack/react-query";

import { fetchLeaderboard } from "../api/leaderboard";

export function LeaderboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: fetchLeaderboard,
    refetchInterval: 10000,
  });

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-white">Leaderboard</h1>
        <p className="text-slate-300">Track wins, placements, and total points across all games.</p>
      </header>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/5 text-slate-400">
          Loading leaderboard...
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 shadow-card backdrop-blur">
          <table className="min-w-full divide-y divide-white/10">
            <thead>
              <tr className="bg-slate-900/80 text-xs uppercase tracking-[0.2em] text-slate-300">
                <th className="px-6 py-3 text-left">Player</th>
                <th className="px-6 py-3 text-left">Total Points</th>
                <th className="px-6 py-3 text-left">Wins</th>
                <th className="px-6 py-3 text-left">2nd</th>
                <th className="px-6 py-3 text-left">3rd</th>
                <th className="px-6 py-3 text-left">Losses</th>
                <th className="px-6 py-3 text-left">Games Played</th>
                <th className="px-6 py-3 text-left">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {data?.entries.length ? (
                data.entries.map((entry) => (
                  <tr key={entry.user_id} className="transition hover:bg-white/5">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/40 to-purple-500/40 text-sm font-semibold text-white">
                          {entry.display_name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="text-base font-semibold text-white">{entry.display_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-100">{entry.total_points}</td>
                    <td className="px-6 py-4 text-sky-300">{entry.wins}</td>
                    <td className="px-6 py-4 text-slate-200">{entry.second_places}</td>
                    <td className="px-6 py-4 text-slate-200">{entry.third_places}</td>
                    <td className="px-6 py-4 text-rose-300">{entry.losses}</td>
                    <td className="px-6 py-4 text-slate-200">{entry.games_played}</td>
                    <td className="px-6 py-4 text-slate-300">{new Date(entry.updated_at).toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-slate-400">
                    No games played yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
