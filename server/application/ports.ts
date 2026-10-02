import type { Replay } from '../../shared/game/replay.ts';
import type { PlaySession } from '../domain/play-session.ts';
import type { ListedScore, RankedScore, ScoreRecord, StoredRun } from '../domain/score.ts';

export interface Clock {
  /** Epoch milliseconds. */
  now(): number;
}

export interface IdGenerator {
  /** Returns a new identifier that cannot be guessed, since holding it is what lets a client submit a score. */
  next(): string;
}

export type RunFailureReason = 'unfinished' | 'continued_after_game_over' | 'engine_error';

export type RunVerdict =
  | {
      readonly ok: true;
      readonly score: number;
      readonly ticks: number;
      /**
       * The same game written down with only the controls the engine acted on. However a game was dressed up with
       * controls the engine ignores, it has this one spelling, which is what makes a repeated game recognisable.
       */
      readonly effective: Replay;
    }
  | { readonly ok: false; readonly reason: RunFailureReason };

export interface RunVerifier {
  /**
   * Plays the recording from the start of a game and says where the run ended.
   * It never throws: a recording that cannot be played is a verdict, not a failure of the server.
   */
  verify(replay: Replay): RunVerdict;
}

export interface LeaderboardStore {
  /** Stores the session. At the configured cap the oldest sessions that never received a score are evicted first. */
  saveSession(session: PlaySession): void;

  findSession(sessionId: string): PlaySession | undefined;

  /** Whether the session already holds a score. */
  isSessionUsed(sessionId: string): boolean;

  /** Removes the sessions that started before `cutoff` (epoch milliseconds) and never received a score. */
  deleteUnusedSessionsStartedBefore(cutoff: number): void;

  /**
   * Stores the score and returns it with its rank: 1 + the number of stored scores that sort before it.
   * A session holds at most one score and a recording can be kept only once. The store itself must enforce both
   * atomically, throwing SessionAlreadyUsedError or DuplicateReplayError, so that two concurrent submissions can never
   * both succeed. A refused score leaves nothing behind: its session stays unused.
   *
   * Only the best scores up to the configured cap are kept. A score that lands below the cut is still ranked and
   * returned, it is just not kept. Scores that are dropped take their session along, so a session whose score is
   * gone can never submit again.
   */
  addScore(record: ScoreRecord): RankedScore;

  /**
   * The best scores ranked 1..N, ordered by score descending, then earliest `achievedAt`, then insertion order.
   * `limit` must be a positive integer. It never reads the recordings.
   */
  topScores(limit: number): RankedScore[];
}

/** What moderators need beyond the game's own operations. Kept apart so that the HTTP side cannot reach it. */
export interface ScoreModerationStore {
  /** Like `topScores`, with the id that `deleteScores` takes on every entry. */
  listScores(limit: number): ListedScore[];

  /**
   * Every kept score with its recording, oldest first. They are handed over one at a time because recordings are
   * large: a consumer that deletes scores must finish iterating first.
   */
  storedRuns(): Iterable<StoredRun>;

  /**
   * Deletes scores by id, together with their sessions so that a removed score cannot be submitted again.
   * Returns the ids that existed; unknown ids are ignored.
   */
  deleteScores(ids: readonly number[]): number[];
}
