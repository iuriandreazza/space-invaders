import type { LeaderboardEntry } from '../../shared/leaderboard-contract.ts';
import type { LeaderboardPort } from '../application/ports.ts';
import { LeaderboardTable } from './LeaderboardTable.tsx';
import { useTopScores } from './useTopScores.ts';

interface LeaderboardProps {
  leaderboard: LeaderboardPort;
  highlight?: LeaderboardEntry | null;
}

/** The best scores of all gunners, with its own loading and error states. */
export function Leaderboard({ leaderboard, highlight }: LeaderboardProps) {
  const { scores, reload } = useTopScores(leaderboard);

  if (scores.status === 'loading') return <p className="muted" role="status">Loading scores…</p>;
  if (scores.status === 'error') {
    return (
      <div role="alert">
        <p className="muted">{scores.message}</p>
        <button type="button" className="button button--small" onClick={reload}>
          Try again
        </button>
      </div>
    );
  }
  return <LeaderboardTable entries={scores.entries} highlight={highlight} />;
}
