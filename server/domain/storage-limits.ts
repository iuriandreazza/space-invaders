/**
 * The API is public and takes writes from anyone, so every table has a ceiling that holds however hard it is flooded.
 */
export interface StorageLimits {
  /**
   * Scores kept, best first, each with the recording that proves it. The UI never asks for more than MAX_PAGE_SIZE
   * entries, so a deeper tail only costs disk; a score below the cut is ranked and answered as usual, it is just
   * not kept.
   */
  readonly maxScores: number;
  /**
   * Sessions kept, scored ones included: they are bounded by `maxScores` and never evicted, so there is always an
   * unused session to evict first. Honest play has few runs in flight, and unused sessions older than a day are
   * pruned anyway, so the cap is only ever reached by a flood, which then pushes out the oldest sessions first.
   */
  readonly maxSessions: number;
}

export const DEFAULT_STORAGE_LIMITS: StorageLimits = { maxScores: 10_000, maxSessions: 50_000 };
