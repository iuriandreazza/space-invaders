import { TICKS_PER_SECOND } from '../../shared/game/constants.ts';
import { maxPlausibleScore } from '../../shared/scoring-limits.ts';

/** A session nobody submitted a score for within a day is abandoned, so it can be forgotten. */
export const SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * A recording may be a little longer than the session is old: the player's clock and the server's do not tick in
 * step, and the game can start ticking before the answer to the session request has arrived.
 */
const RUN_DURATION_TOLERANCE = 1.02;
const RUN_DURATION_ALLOWANCE_SECONDS = 2;

/** A stopwatch started when a run begins; it lets the API judge how long and how rich a submitted run can be. */
export interface PlaySession {
  readonly id: string;
  /** Epoch milliseconds. */
  readonly startedAt: number;
}

/** `now` is epoch milliseconds, like `startedAt`. */
export function isScorePlausible(session: PlaySession, score: number, now: number): boolean {
  const elapsedSeconds = (now - session.startedAt) / 1000;
  return score <= maxPlausibleScore(elapsedSeconds);
}

/** Time cannot be forged: a game of `ticks` ticks took at least as long as it says, so it fits in the age of the session. */
export function isRunDurationPlausible(session: PlaySession, ticks: number, now: number): boolean {
  const elapsedSeconds = Math.max(0, (now - session.startedAt) / 1000);
  return ticks / TICKS_PER_SECOND <= elapsedSeconds * RUN_DURATION_TOLERANCE + RUN_DURATION_ALLOWANCE_SECONDS;
}
