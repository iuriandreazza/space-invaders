import { replayTicks, type Replay } from '../../shared/game/replay.ts';
import { LeaderboardService } from '../application/leaderboard-service.ts';
import type { Clock, IdGenerator, RunFailureReason, RunVerdict, RunVerifier } from '../application/ports.ts';
import type { StorageLimits } from '../domain/storage-limits.ts';
import { InMemoryLeaderboardStore } from '../infrastructure/in-memory-leaderboard-store.ts';

/** Test support: a clock that only moves when told to. */
export class ManualClock implements Clock {
  #now: number;

  constructor(startAt = 1_700_000_000_000) {
    this.#now = startAt;
  }

  now(): number {
    return this.#now;
  }

  advance(milliseconds: number): void {
    this.#now += milliseconds;
  }
}

/** Test support: ids that are predictable (`session-1`, `session-2`, ...). */
export class SequentialIdGenerator implements IdGenerator {
  #issued = 0;

  next(): string {
    this.#issued += 1;
    return `session-${this.#issued}`;
  }
}

/**
 * Two controls held for three ticks each: 32 x 31 of them are told apart, and each one is shape-valid and six ticks
 * long. Three ticks and not one, so that none is the same as a short replay a test writes by hand.
 */
const DISTINCT_REPLAYS = 32 * 31;

function distinctReplay(index: number): number[] {
  if (index >= DISTINCT_REPLAYS) {
    throw new RangeError(`FakeRunVerifier can only hand out ${DISTINCT_REPLAYS} different replays.`);
  }
  const first = index % 32;
  const second = (first + 1 + Math.floor(index / 32)) % 32;
  return [first, 3, second, 3];
}

/**
 * Test support: a verifier that plays nothing. It judges the replays it handed out itself as it was told to, and
 * anything else as a run that never ended. Every replay it hands out is different, so none collides with another.
 */
export class FakeRunVerifier implements RunVerifier {
  /** Every replay it was asked to verify, in order: a test reads it to prove a check came before the simulation. */
  readonly asked: Replay[] = [];
  readonly #verdicts = new Map<string, RunVerdict>();

  /** A new replay that this fake takes for a finished game scoring `score`, and for its own effective replay. */
  recordRun(score: number): number[] {
    return this.acceptAs(distinctReplay(this.#verdicts.size), score);
  }

  /**
   * Takes a replay of the test's own making for a finished game scoring `score`, for one whose length matters or
   * one that is another spelling of a game: `effective` is what the engine would hand back, the replay itself by default.
   */
  acceptAs(replay: number[], score: number, effective: readonly number[] = replay): number[] {
    return this.judge(replay, { ok: true, score, ticks: replayTicks(replay), effective });
  }

  /** A new replay that this fake refuses for `reason`. */
  recordFailure(reason: RunFailureReason): number[] {
    return this.judge(distinctReplay(this.#verdicts.size), { ok: false, reason });
  }

  /** Decides what this fake says about a replay of the test's own making. */
  judge(replay: number[], verdict: RunVerdict): number[] {
    this.#verdicts.set(JSON.stringify(replay), verdict);
    return replay;
  }

  verify(replay: Replay): RunVerdict {
    this.asked.push(replay);
    return this.#verdicts.get(JSON.stringify(replay)) ?? { ok: false, reason: 'unfinished' };
  }
}

/** Test support: the real use cases wired to the in-memory store and deterministic fakes. */
export function createTestService(limits?: StorageLimits) {
  const clock = new ManualClock();
  const store = new InMemoryLeaderboardStore(limits);
  const verifier = new FakeRunVerifier();
  const service = new LeaderboardService({ store, clock, ids: new SequentialIdGenerator(), verifier });
  return { service, store, clock, verifier };
}
