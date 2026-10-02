/**
 * Upper bound of points an honest run can earn per second of play, derived from what the engine can award.
 * The API plays every run again, so this is no longer what keeps scores honest: it is a safety net that refuses a
 * score the engine should never produce. A test in the game domain checks the engine can never beat it, so the
 * two sides cannot drift apart.
 */
export const MAX_SCORE_PER_SECOND = 1_000;

/** Flat allowance that absorbs timing jitter between starting a session and submitting a score. */
export const SCORE_ALLOWANCE = 1_000;

export function maxPlausibleScore(elapsedSeconds: number): number {
  return SCORE_ALLOWANCE + MAX_SCORE_PER_SECOND * Math.max(0, elapsedSeconds);
}
