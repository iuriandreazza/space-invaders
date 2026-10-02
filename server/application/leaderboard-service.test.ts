import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../../shared/game/replay.ts';
import type { SubmitScoreRequest } from '../../shared/leaderboard-contract.ts';
import { SCORE_ALLOWANCE } from '../../shared/scoring-limits.ts';
import { SESSION_RETENTION_MS } from '../domain/play-session.ts';
import type { ScoreSubmission } from '../domain/score-submission.ts';
import type { StorageLimits } from '../domain/storage-limits.ts';
import { InMemoryLeaderboardStore } from '../infrastructure/in-memory-leaderboard-store.ts';
import { createTestService, FakeRunVerifier, ManualClock, SequentialIdGenerator } from '../testing/fakes.ts';
import { buildSubmitScoreRequest } from '../testing/requests.ts';
import {
  DuplicateReplayError,
  ImplausibleScoreError,
  InitialsNotAllowedError,
  InvalidReplayError,
  OutdatedClientError,
  ScoreMismatchError,
  SessionAlreadyUsedError,
  UnknownSessionError,
} from './errors.ts';
import { LeaderboardService } from './leaderboard-service.ts';

function captureError(work: () => unknown): unknown {
  try {
    work();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to throw.');
}

function setup(limits?: StorageLimits) {
  const harness = createTestService(limits);

  /** A submission the fake verifier will take for a finished game scoring `score`. */
  function submission(sessionId: string, score: number, overrides: Partial<SubmitScoreRequest> = {}): ScoreSubmission {
    // A replay the test brought along is judged as the test said; only without one does the fake make one up.
    const replay = overrides.replay ?? harness.verifier.recordRun(score);
    return buildSubmitScoreRequest({ sessionId, score, ...overrides, replay });
  }

  /** Starts a session and submits right away, which is plausible for runs this short. */
  function playAndSubmit(initials: string, score: number) {
    const session = harness.service.startSession();
    return harness.service.submitScore(submission(session.id, score, { initials }));
  }

  return { ...harness, submission, playAndSubmit };
}

describe('LeaderboardService', () => {
  describe('startSession', () => {
    it('issues sessions that start at the time given by the clock', () => {
      const { service, clock } = setup();
      const startedAt = clock.now();

      expect(service.startSession()).toEqual({ id: 'session-1', startedAt });
      clock.advance(5_000);
      expect(service.startSession()).toEqual({ id: 'session-2', startedAt: startedAt + 5_000 });
    });

    describe('pruning', () => {
      it('forgets unused sessions older than the retention window', () => {
        const { service, clock, submission } = setup();
        const stale = service.startSession();

        clock.advance(SESSION_RETENTION_MS + 1);
        const fresh = service.startSession();

        expect(() => service.submitScore(submission(stale.id, 10))).toThrow(UnknownSessionError);
        expect(service.submitScore(submission(fresh.id, 10)).rank).toBe(1);
      });

      it('keeps an unused session that is exactly as old as the retention window', () => {
        const { service, clock, submission } = setup();
        const borderline = service.startSession();

        clock.advance(SESSION_RETENTION_MS);
        service.startSession();

        // A day is long enough for a recording of any length, so only the pruning could refuse it.
        expect(service.submitScore(submission(borderline.id, 10)).rank).toBe(1);
      });

      it('keeps old sessions that already received a score, so replays are still told apart from unknown ids', () => {
        const { service, clock, submission } = setup();
        const used = service.startSession();
        service.submitScore(submission(used.id, 10));

        clock.advance(SESSION_RETENTION_MS + 1);
        service.startSession();

        expect(() => service.submitScore(submission(used.id, 20))).toThrow(SessionAlreadyUsedError);
      });
    });

    describe('when the store is full of sessions', () => {
      it('pushes out the oldest unused session to make room for the new one', () => {
        const { service, submission } = setup({ maxScores: 100, maxSessions: 2 });
        const oldest = service.startSession();
        const middle = service.startSession();
        const newest = service.startSession();

        expect(() => service.submitScore(submission(oldest.id, 10))).toThrow(UnknownSessionError);
        expect(service.submitScore(submission(middle.id, 10)).rank).toBe(1);
        expect(service.submitScore(submission(newest.id, 20)).rank).toBe(1);
      });
    });
  });

  describe('submitScore', () => {
    it('keeps the score with the time it was submitted, the version and the recording it comes from', () => {
      const { service, store, clock, submission } = setup();
      const session = service.startSession();
      clock.advance(20_000);
      const request = submission(session.id, 500, { initials: 'ABC' });

      const ranked = service.submitScore(request);

      expect(ranked).toEqual({ rank: 1, initials: 'ABC', score: 500, achievedAt: clock.now() });
      expect(service.topScores(10)).toEqual([ranked]);
      expect([...store.storedRuns()]).toEqual([
        { id: 1, initials: 'ABC', score: 500, engineVersion: ENGINE_VERSION, replay: request.replay },
      ]);
    });

    describe('the recording that is kept', () => {
      it('is the game as the engine played it, not the bytes that were sent', () => {
        const { service, store, verifier, submission } = setup();
        const session = service.startSession();
        // Left and right held together are ignored by the engine, which hands the game back without them.
        const dressedUp = verifier.acceptAs([2, 1, 3, 1], 10, [2, 1, 0, 1]);

        service.submitScore(submission(session.id, 10, { replay: dressedUp }));

        expect([...store.storedRuns()].map((run) => run.replay)).toEqual([[2, 1, 0, 1]]);
      });

      it('is what a repeated game is recognised by, however it was dressed up', () => {
        const { service, verifier, submission } = setup();
        const first = service.startSession();
        const second = service.startSession();
        const plain = verifier.acceptAs([2, 1, 0, 1], 10);
        const dressedUp = verifier.acceptAs([2, 1, 3, 1], 10, [2, 1, 0, 1]);
        service.submitScore(submission(first.id, 10, { replay: plain }));

        expect(() => service.submitScore(submission(second.id, 10, { replay: dressedUp }))).toThrow(
          DuplicateReplayError,
        );
        expect(service.submitScore(submission(second.id, 20)).rank).toBe(1);
      });

      it('does not change how long the run is taken to have lasted: that is counted from what was sent', () => {
        const { service, verifier, submission } = setup();
        const session = service.startSession();
        const shortWhenPlayed = verifier.acceptAs([1, 1, 2, 7200], 10, [1, 1]);
        const askedBefore = verifier.asked.length;

        expect(() => service.submitScore(submission(session.id, 10, { replay: shortWhenPlayed }))).toThrow(
          ImplausibleScoreError,
        );
        expect(verifier.asked).toHaveLength(askedBefore);
      });
    });

    describe('refuses', () => {
      it('an unknown session, before looking at anything else', () => {
        const { service, verifier, submission } = setup();

        expect(() => service.submitScore(submission('nope', 10, { initials: 'ASS', engineVersion: 0 }))).toThrow(
          UnknownSessionError,
        );
        expect(verifier.asked).toEqual([]);
        expect(service.topScores(10)).toEqual([]);
      });

      it('a session that has submitted already, without playing the recording again', () => {
        const { service, verifier, submission } = setup();
        const session = service.startSession();
        service.submitScore(submission(session.id, 500));
        const askedBefore = verifier.asked.length;

        expect(() => service.submitScore(submission(session.id, 900))).toThrow(SessionAlreadyUsedError);
        expect(verifier.asked).toHaveLength(askedBefore);
        expect(service.topScores(10)).toHaveLength(1);
      });

      it('initials that are not allowed, without playing the recording, and keeps the session usable', () => {
        const { service, verifier, submission } = setup();
        const session = service.startSession();

        expect(() => service.submitScore(submission(session.id, 10, { initials: 'ASS' }))).toThrow(
          InitialsNotAllowedError,
        );
        expect(() => service.submitScore(submission(session.id, 10, { initials: 'A55' }))).toThrow(
          InitialsNotAllowedError,
        );
        expect(verifier.asked).toEqual([]);
        expect(service.submitScore(submission(session.id, 10, { initials: 'ACE' })).rank).toBe(1);
      });

      it('a recording made by another version of the rules, without playing it, and keeps the session usable', () => {
        const { service, verifier, submission } = setup();
        const session = service.startSession();

        expect(() => service.submitScore(submission(session.id, 10, { engineVersion: ENGINE_VERSION - 1 }))).toThrow(
          OutdatedClientError,
        );
        expect(() => service.submitScore(submission(session.id, 10, { engineVersion: ENGINE_VERSION + 1 }))).toThrow(
          OutdatedClientError,
        );
        expect(verifier.asked).toEqual([]);
        expect(service.submitScore(submission(session.id, 10)).rank).toBe(1);
      });

      it('a recording longer than its session is old, without playing it, and keeps the session usable', () => {
        const { service, verifier, clock, submission } = setup();
        const session = service.startSession();
        const twoMinutes = verifier.acceptAs([1, 1, 2, 2 * 60 * 60], 10);
        const askedBefore = verifier.asked.length;

        expect(() => service.submitScore(submission(session.id, 10, { replay: twoMinutes }))).toThrow(
          ImplausibleScoreError,
        );
        expect(verifier.asked).toHaveLength(askedBefore);

        clock.advance(2 * 60 * 1000);
        expect(service.submitScore(submission(session.id, 10, { replay: twoMinutes })).rank).toBe(1);
      });

      it.each(['unfinished', 'continued_after_game_over', 'engine_error'] as const)(
        'a recording the verifier cannot accept (%s), and keeps the session usable',
        (reason) => {
          const { service, verifier, submission } = setup();
          const session = service.startSession();
          const refused = submission(session.id, 10, { replay: verifier.recordFailure(reason) });

          const error = captureError(() => service.submitScore(refused));

          expect(error).toBeInstanceOf(InvalidReplayError);
          expect((error as InvalidReplayError).reason).toBe(reason);
          expect(service.topScores(10)).toEqual([]);
          expect(service.submitScore(submission(session.id, 10)).rank).toBe(1);
        },
      );

      it('a score other than the one the recording gives, and keeps the session usable', () => {
        const { service, verifier, submission } = setup();
        const session = service.startSession();
        const recordingOfFour = verifier.recordRun(400);

        expect(() => service.submitScore(submission(session.id, 500, { replay: recordingOfFour }))).toThrow(
          ScoreMismatchError,
        );
        expect(() => service.submitScore(submission(session.id, 300, { replay: recordingOfFour }))).toThrow(
          ScoreMismatchError,
        );
        expect(service.submitScore(submission(session.id, 400, { replay: recordingOfFour })).score).toBe(400);
      });

      it('a score that the engine should never reach in the time played, and keeps the session usable', () => {
        const { service, verifier, clock, submission } = setup();
        const session = service.startSession();
        const absurd = SCORE_ALLOWANCE + 1;

        expect(() => service.submitScore(submission(session.id, absurd))).toThrow(ImplausibleScoreError);
        // This is the safety net, so the recording is played before it is applied.
        expect(verifier.asked).toHaveLength(1);

        clock.advance(1_000);
        expect(service.submitScore(submission(session.id, absurd)).score).toBe(absurd);
      });

      it('a recording that is already on the board, and keeps the session usable', () => {
        const { service, verifier, submission } = setup();
        const first = service.startSession();
        const second = service.startSession();
        const recording = verifier.recordRun(500);
        service.submitScore(submission(first.id, 500, { replay: recording }));

        expect(() => service.submitScore(submission(second.id, 500, { replay: recording }))).toThrow(
          DuplicateReplayError,
        );
        expect(service.topScores(10)).toHaveLength(1);
        expect(service.submitScore(submission(second.id, 600)).rank).toBe(1);
      });

      it('a second score for a session even when two submissions race past the early check', () => {
        // The store answers "unused" to everyone, as it would to two requests that arrive together.
        class RacingStore extends InMemoryLeaderboardStore {
          override isSessionUsed(): boolean {
            return false;
          }
        }
        const verifier = new FakeRunVerifier();
        const service = new LeaderboardService({
          store: new RacingStore(),
          clock: new ManualClock(),
          ids: new SequentialIdGenerator(),
          verifier,
        });
        const session = service.startSession();
        const request = (score: number) =>
          buildSubmitScoreRequest({ sessionId: session.id, score, replay: verifier.recordRun(score) });
        service.submitScore(request(100));

        expect(() => service.submitScore(request(200))).toThrow(SessionAlreadyUsedError);
      });
    });

    describe('runs the checks from the cheapest and answers with the first that fails', () => {
      it('so that a request that breaks every rule is told about the session first, and the verifier is never asked', () => {
        const { service, verifier, submission } = setup();
        const used = service.startSession();
        service.submitScore(submission(used.id, 10));
        const askedBefore = verifier.asked.length;
        const breaksEverything = (sessionId: string) =>
          submission(sessionId, SCORE_ALLOWANCE + 1, {
            initials: 'ASS',
            engineVersion: 0,
            replay: [1, 1, 2, 2 * 60 * 60],
          });

        expect(() => service.submitScore(breaksEverything('nope'))).toThrow(UnknownSessionError);
        expect(() => service.submitScore(breaksEverything(used.id))).toThrow(SessionAlreadyUsedError);
        expect(verifier.asked).toHaveLength(askedBefore);
      });

      it.each([
        ['the initials come before the version', { initials: 'ASS', engineVersion: 0 }, InitialsNotAllowedError],
        ['the version comes before the length', { engineVersion: 0, replay: [1, 1, 2, 7200] }, OutdatedClientError],
        ['the length comes before the simulation', { replay: [1, 1, 2, 7200] }, ImplausibleScoreError],
      ])('%s', (_order, overrides, expected) => {
        const { service, verifier, submission } = setup();
        const session = service.startSession();

        expect(() => service.submitScore(submission(session.id, 10, overrides))).toThrow(expected);
        expect(verifier.asked).toEqual([]);
      });

      it('and plays the recording before comparing the score and applying the points cap', () => {
        const { service, verifier, submission } = setup();
        const session = service.startSession();
        const mismatchAndAbsurd = submission(session.id, SCORE_ALLOWANCE + 1, {
          replay: verifier.recordRun(SCORE_ALLOWANCE + 2),
        });

        expect(() => service.submitScore(mismatchAndAbsurd)).toThrow(ScoreMismatchError);
      });
    });

    describe('ranking', () => {
      it('ranks each new score against what is already stored', () => {
        const { playAndSubmit } = setup();

        expect(playAndSubmit('MID', 300).rank).toBe(1);
        expect(playAndSubmit('TOP', 500).rank).toBe(1);
        expect(playAndSubmit('LOW', 100).rank).toBe(3);
        expect(playAndSubmit('SEC', 400).rank).toBe(2);
      });

      it('puts the earlier achievement first when scores are equal', () => {
        const { playAndSubmit, clock, service } = setup();

        playAndSubmit('FST', 500);
        clock.advance(1_000);
        const later = playAndSubmit('SND', 500);

        expect(later.rank).toBe(2);
        expect(service.topScores(10).map((entry) => entry.initials)).toEqual(['FST', 'SND']);
      });

      it('falls back to insertion order when score and time are both equal', () => {
        const { playAndSubmit, service } = setup();

        const ranks = ['AAA', 'BBB', 'CCC'].map((initials) => playAndSubmit(initials, 500).rank);

        expect(ranks).toEqual([1, 2, 3]);
        expect(service.topScores(10).map((entry) => entry.initials)).toEqual(['AAA', 'BBB', 'CCC']);
      });
    });

    describe('when the board is full', () => {
      const limits: StorageLimits = { maxScores: 2, maxSessions: 100 };

      it('ranks a score that falls below the cut but does not keep it, and its session cannot be tried again', () => {
        const { service, verifier, submission, playAndSubmit } = setup(limits);
        playAndSubmit('TOP', 500);
        playAndSubmit('SEC', 400);
        const below = service.startSession();

        const ranked = service.submitScore(submission(below.id, 300));

        expect(ranked.rank).toBe(3);
        expect(service.topScores(10).map((entry) => entry.score)).toEqual([500, 400]);
        // Told as an unknown session, not as a free slot: the score is gone and so is the session.
        const askedBefore = verifier.asked.length;
        expect(() => service.submitScore(submission(below.id, 450))).toThrow(UnknownSessionError);
        expect(verifier.asked).toHaveLength(askedBefore);
      });

      it('drops the lowest score, and with it its session, when a better one comes in', () => {
        const { service, submission, playAndSubmit } = setup(limits);
        playAndSubmit('TOP', 500);
        const lowest = service.startSession();
        service.submitScore(submission(lowest.id, 300, { initials: 'LOW' }));

        expect(playAndSubmit('NEW', 400).rank).toBe(2);

        expect(service.topScores(10).map((entry) => entry.initials)).toEqual(['TOP', 'NEW']);
        expect(() => service.submitScore(submission(lowest.id, 300))).toThrow(UnknownSessionError);
      });
    });
  });

  describe('topScores', () => {
    it('lists ranked entries from the best score down, honouring the limit', () => {
      const { playAndSubmit, service } = setup();
      playAndSubmit('LOW', 100);
      playAndSubmit('TOP', 900);
      playAndSubmit('MID', 500);

      expect(service.topScores(10).map(({ rank, initials, score }) => ({ rank, initials, score }))).toEqual([
        { rank: 1, initials: 'TOP', score: 900 },
        { rank: 2, initials: 'MID', score: 500 },
        { rank: 3, initials: 'LOW', score: 100 },
      ]);
      expect(service.topScores(2).map((entry) => entry.initials)).toEqual(['TOP', 'MID']);
    });

    it('is empty before anyone has scored', () => {
      expect(setup().service.topScores(10)).toEqual([]);
    });
  });
});
