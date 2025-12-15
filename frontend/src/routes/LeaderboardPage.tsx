import { useQuery } from "@tanstack/react-query";

import { fetchLeaderboard } from "../api/leaderboard";

export function LeaderboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: fetchLeaderboard,
    refetchInterval: 10000,
  });

  return (
    <div className="page">
      <header className="page__header">
        <h1>Leaderboard</h1>
        <p>Track wins, placements, and total points across all games.</p>
      </header>

      {isLoading ? (
        <p>Loading leaderboard...</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Total Points</th>
                <th>Wins</th>
                <th>2nd</th>
                <th>3rd</th>
                <th>Losses</th>
                <th>Games Played</th>
                <th>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {data?.entries.length ? (
                data.entries.map((entry) => (
                  <tr key={entry.user_id}>
                    <td>{entry.display_name}</td>
                    <td>{entry.total_points}</td>
                    <td>{entry.wins}</td>
                    <td>{entry.second_places}</td>
                    <td>{entry.third_places}</td>
                    <td>{entry.losses}</td>
                    <td>{entry.games_played}</td>
                    <td>{new Date(entry.updated_at).toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>No games played yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
