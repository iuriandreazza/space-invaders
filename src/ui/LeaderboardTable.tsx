import type { LeaderboardEntry } from '../../shared/leaderboard-contract.ts';

interface LeaderboardTableProps {
  entries: readonly LeaderboardEntry[];
  /** The entry that was just saved, shown in a different color. */
  highlight?: LeaderboardEntry | null;
}

export function formatScore(score: number): string {
  return score.toLocaleString('en-US');
}

function isSameEntry(a: LeaderboardEntry, b: LeaderboardEntry | null | undefined): boolean {
  return !!b && a.rank === b.rank && a.initials === b.initials && a.score === b.score;
}

export function LeaderboardTable({ entries, highlight }: LeaderboardTableProps) {
  if (entries.length === 0) return <p className="muted">No scores yet. Be the first gunner on the board!</p>;

  return (
    <table className="leaderboard">
      <caption className="visually-hidden">Highest scores</caption>
      <thead>
        <tr>
          <th scope="col">Rank</th>
          <th scope="col">Gunner</th>
          <th scope="col">Score</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.rank} className={isSameEntry(entry, highlight) ? 'leaderboard__you' : undefined}>
            <td>{entry.rank}</td>
            <td>{entry.initials}</td>
            <td>{formatScore(entry.score)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
