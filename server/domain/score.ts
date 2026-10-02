import type { Replay } from '../../shared/game/replay.ts';

/** A score that has been verified, stamped with the moment it was accepted. */
export interface ScoreRecord {
  readonly sessionId: string;
  readonly initials: string;
  /** The score the replay produced, which is the only one worth keeping. */
  readonly score: number;
  /** Epoch milliseconds. */
  readonly achievedAt: number;
  /**
   * Where the score comes from: the version of the rules and the game as the engine played it, which is the effective
   * replay and not the bytes that were sent. Both are absent only on scores that were kept before recordings were.
   */
  readonly engineVersion?: number;
  readonly replay?: Replay;
}

/**
 * A stored score with its 1-based position on the leaderboard.
 * Leaderboard order: score descending, then earliest `achievedAt`, then insertion order.
 */
export interface RankedScore {
  readonly rank: number;
  readonly initials: string;
  readonly score: number;
  /** Epoch milliseconds. */
  readonly achievedAt: number;
}

/** A ranked score with the id moderators use to remove it. Ids stay inside the server and never go over HTTP. */
export interface ListedScore extends RankedScore {
  readonly id: number;
}

/** A kept score together with its recording, for auditing it again. `null` where there is none to speak of. */
export interface StoredRun {
  readonly id: number;
  readonly initials: string;
  readonly score: number;
  readonly engineVersion: number | null;
  readonly replay: Replay | null;
}
