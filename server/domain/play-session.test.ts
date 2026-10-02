import { describe, expect, it } from 'vitest';
import { MAX_DISPLAYED_SCORE, TICKS_PER_SECOND } from '../../shared/game/constants.ts';
import { MAX_REPLAY_TICKS } from '../../shared/game/replay.ts';
import { MAX_SCORE_PER_SECOND, SCORE_ALLOWANCE } from '../../shared/scoring-limits.ts';
import {
  isRunDurationPlausible,
  isScorePlausible,
  SESSION_RETENTION_MS,
  type PlaySession,
} from './play-session.ts';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const session: PlaySession = { id: 'session-1', startedAt: 1_700_000_000_000 };

function boundAfter(milliseconds: number): number {
  return SCORE_ALLOWANCE + (MAX_SCORE_PER_SECOND * milliseconds) / 1000;
}

describe('isScorePlausible', () => {
  it('only allows the flat allowance at the moment the session starts', () => {
    expect(isScorePlausible(session, SCORE_ALLOWANCE, session.startedAt)).toBe(true);
    expect(isScorePlausible(session, SCORE_ALLOWANCE + 1, session.startedAt)).toBe(false);
  });

  it('accepts a score equal to the bound and rejects one point above it', () => {
    const elapsed = 10_000;
    const bound = boundAfter(elapsed);
    expect(isScorePlausible(session, bound, session.startedAt + elapsed)).toBe(true);
    expect(isScorePlausible(session, bound + 1, session.startedAt + elapsed)).toBe(false);
  });

  it('accounts for fractions of a second', () => {
    const elapsed = 1_500;
    const bound = boundAfter(elapsed);
    expect(Number.isInteger(bound)).toBe(true);
    expect(isScorePlausible(session, bound, session.startedAt + elapsed)).toBe(true);
    expect(isScorePlausible(session, bound + 1, session.startedAt + elapsed)).toBe(false);
  });

  it('only grants the allowance when the clock reads earlier than the start', () => {
    const now = session.startedAt - 60_000;
    expect(isScorePlausible(session, SCORE_ALLOWANCE, now)).toBe(true);
    expect(isScorePlausible(session, SCORE_ALLOWANCE + 1, now)).toBe(false);
  });

  it('accepts every legal score once the session is old enough', () => {
    expect(isScorePlausible(session, MAX_DISPLAYED_SCORE, session.startedAt + ONE_DAY_MS)).toBe(true);
  });
});

describe('isRunDurationPlausible', () => {
  it('only allows the flat two seconds at the moment the session starts', () => {
    const twoSeconds = 2 * TICKS_PER_SECOND;

    expect(isRunDurationPlausible(session, twoSeconds, session.startedAt)).toBe(true);
    expect(isRunDurationPlausible(session, twoSeconds + 1, session.startedAt)).toBe(false);
  });

  it('allows two per cent more than the age of the session, plus the two seconds', () => {
    const now = session.startedAt + 100_000;
    // 100 s * 1.02 + 2 s = 104 s
    const allowedTicks = 104 * TICKS_PER_SECOND;

    expect(isRunDurationPlausible(session, allowedTicks, now)).toBe(true);
    expect(isRunDurationPlausible(session, allowedTicks + 1, now)).toBe(false);
  });

  it('does not let a short session claim a long game', () => {
    const aMinuteOld = session.startedAt + 60_000;

    expect(isRunDurationPlausible(session, 10 * 60 * TICKS_PER_SECOND, aMinuteOld)).toBe(false);
  });

  it('counts a clock that reads earlier than the start as no time having passed', () => {
    const before = session.startedAt - 60_000;

    expect(isRunDurationPlausible(session, 2 * TICKS_PER_SECOND, before)).toBe(true);
    expect(isRunDurationPlausible(session, 2 * TICKS_PER_SECOND + 1, before)).toBe(false);
  });

  it('accepts the longest game there is once the session is old enough, and not a minute earlier than that', () => {
    const twoHoursOld = session.startedAt + 2 * 60 * 60 * 1000;

    expect(isRunDurationPlausible(session, MAX_REPLAY_TICKS, twoHoursOld)).toBe(true);
    expect(isRunDurationPlausible(session, MAX_REPLAY_TICKS, session.startedAt + 60_000)).toBe(false);
  });
});

describe('SESSION_RETENTION_MS', () => {
  it('is 24 hours', () => {
    expect(SESSION_RETENTION_MS).toBe(ONE_DAY_MS);
  });
});
