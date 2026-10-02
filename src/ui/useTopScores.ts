import { useEffect, useState } from 'react';
import { DEFAULT_PAGE_SIZE, type LeaderboardEntry } from '../../shared/leaderboard-contract.ts';
import { LeaderboardError, type LeaderboardPort } from '../application/ports.ts';

type TopScores =
  | { status: 'loading' }
  | { status: 'ready'; entries: LeaderboardEntry[] }
  | { status: 'error'; message: string };

type Settled = Exclude<TopScores, { status: 'loading' }>;

function describeLeaderboardError(error: unknown): string {
  if (error instanceof LeaderboardError && error.code === 'network') return 'The leaderboard is offline right now.';
  return 'The leaderboard could not be loaded.';
}

/** Loads the best scores; `reload` tries again, for instance after an error. */
export function useTopScores(
  leaderboard: LeaderboardPort,
  limit = DEFAULT_PAGE_SIZE,
): { scores: TopScores; reload: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ attempt: number; scores: Settled } | null>(null);

  useEffect(() => {
    let cancelled = false;
    leaderboard.topScores(limit).then(
      (entries) => {
        if (!cancelled) setSettled({ attempt, scores: { status: 'ready', entries } });
      },
      (error: unknown) => {
        if (!cancelled) setSettled({ attempt, scores: { status: 'error', message: describeLeaderboardError(error) } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [leaderboard, limit, attempt]);

  const scores: TopScores = settled?.attempt === attempt ? settled.scores : { status: 'loading' };
  return { scores, reload: () => setAttempt((current) => current + 1) };
}
