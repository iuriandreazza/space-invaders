import { isInitialsAllowed } from '../../shared/blocked-initials.ts';
import { ENGINE_VERSION, replayTicks, type Replay } from '../../shared/game/replay.ts';
import {
  isRunDurationPlausible,
  isScorePlausible,
  SESSION_RETENTION_MS,
  type PlaySession,
} from '../domain/play-session.ts';
import type { RankedScore } from '../domain/score.ts';
import type { ScoreSubmission } from '../domain/score-submission.ts';
import {
  ImplausibleScoreError,
  InitialsNotAllowedError,
  InvalidReplayError,
  OutdatedClientError,
  ScoreMismatchError,
  SessionAlreadyUsedError,
  UnknownSessionError,
} from './errors.ts';
import type { Clock, IdGenerator, LeaderboardStore, RunVerifier } from './ports.ts';

export interface LeaderboardServiceDependencies {
  readonly store: LeaderboardStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly verifier: RunVerifier;
}

/**
 * The service trusts the shape of its input: callers must validate it first with parseScoreSubmission and
 * parsePageSize. An unchecked limit would reach the store, and SQLite reads a negative LIMIT as "no limit".
 */
export class LeaderboardService {
  readonly #store: LeaderboardStore;
  readonly #clock: Clock;
  readonly #ids: IdGenerator;
  readonly #verifier: RunVerifier;

  constructor({ store, clock, ids, verifier }: LeaderboardServiceDependencies) {
    this.#store = store;
    this.#clock = clock;
    this.#ids = ids;
    this.#verifier = verifier;
  }

  startSession(): PlaySession {
    const session: PlaySession = { id: this.#ids.next(), startedAt: this.#clock.now() };
    // Pruning here keeps the table bounded without needing a background job.
    this.#store.deleteUnusedSessionsStartedBefore(session.startedAt - SESSION_RETENTION_MS);
    this.#store.saveSession(session);
    return session;
  }

  /**
   * Keeps a score only if playing the recording again gives exactly that score. The checks run from the cheapest to the
   * most expensive and the session is spent only by a submission that passed all of them, so a refusal never costs the
   * player the session. The errors thrown, in the order they can occur: UnknownSessionError, SessionAlreadyUsedError,
   * InitialsNotAllowedError, OutdatedClientError, ImplausibleScoreError, InvalidReplayError, ScoreMismatchError and,
   * from the store, SessionAlreadyUsedError or DuplicateReplayError.
   */
  submitScore(submission: ScoreSubmission): RankedScore {
    const session = this.#unusedSession(submission.sessionId);
    if (!isInitialsAllowed(submission.initials)) {
      throw new InitialsNotAllowedError();
    }
    if (submission.engineVersion !== ENGINE_VERSION) {
      throw new OutdatedClientError();
    }

    const now = this.#clock.now();
    // Playing a recording runs in this process, and its cost grows with the length of the run. This check is what
    // bounds the cost: a recording can only be as long as its session is old, so every millisecond of CPU a client asks
    // for has to be waited for first, and the rate limit stops it from stacking sessions. A junk recording costs no more
    // than the game it plays: the simulation stops at the first tick after the game is over.
    if (!isRunDurationPlausible(session, replayTicks(submission.replay), now)) {
      throw new ImplausibleScoreError();
    }
    const { score, effective } = this.#playReplay(submission);
    // A safety net: the replay already fixes the score, but the engine must never be able to beat the points cap.
    if (!isScorePlausible(session, score, now)) {
      throw new ImplausibleScoreError();
    }

    return this.#store.addScore({
      sessionId: session.id,
      initials: submission.initials,
      score,
      achievedAt: now,
      engineVersion: submission.engineVersion,
      // The game as the engine played it, not the bytes that were sent. It is bounded, clean of anything the client
      // stuffed into controls the engine ignores, and the same for every spelling of the same game: so it is also
      // what the store recognises a repeated game by.
      replay: effective,
    });
  }

  topScores(limit: number): RankedScore[] {
    return this.#store.topScores(limit);
  }

  #unusedSession(sessionId: string): PlaySession {
    const session = this.#store.findSession(sessionId);
    if (session === undefined) {
      throw new UnknownSessionError();
    }
    // Asking first spares a simulation for a request that is bound to fail; the store's constraint still settles races.
    if (this.#store.isSessionUsed(sessionId)) {
      throw new SessionAlreadyUsedError();
    }
    return session;
  }

  /** The score kept is always the simulated one; the client's is only there to be checked against it. */
  #playReplay(submission: ScoreSubmission): { score: number; effective: Replay } {
    const verdict = this.#verifier.verify(submission.replay);
    if (!verdict.ok) {
      throw new InvalidReplayError(verdict.reason);
    }
    if (verdict.score !== submission.score) {
      throw new ScoreMismatchError();
    }
    return { score: verdict.score, effective: verdict.effective };
  }
}
