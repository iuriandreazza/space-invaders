import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../../shared/game/replay.ts';
import { DuplicateReplayError, SessionAlreadyUsedError } from '../application/errors.ts';
import type { LeaderboardStore, ScoreModerationStore } from '../application/ports.ts';
import type { ScoreRecord } from '../domain/score.ts';
import { DEFAULT_STORAGE_LIMITS, type StorageLimits } from '../domain/storage-limits.ts';
import { InMemoryLeaderboardStore } from './in-memory-leaderboard-store.ts';
import { SqliteLeaderboardStore } from './sqlite-leaderboard-store.ts';

type Store = LeaderboardStore & ScoreModerationStore;

interface StoreUnderTest {
  readonly store: Store;
  dispose(): void;
}

/** A score to keep; given a replay it comes with the provenance of a verified one. */
function record(sessionId: string, initials: string, score: number, achievedAt: number, replay?: number[]): ScoreRecord {
  const provenance = replay === undefined ? {} : { engineVersion: ENGINE_VERSION, replay };
  return { sessionId, initials, score, achievedAt, ...provenance };
}

function session(id: string, startedAt: number) {
  return { id, startedAt };
}

/** The behaviour every store adapter must show, whatever it persists to. */
function describeLeaderboardStoreContract(name: string, open: (limits: StorageLimits) => StoreUnderTest): void {
  describe(`${name} honours the store contracts`, () => {
    let opened: StoreUnderTest[];
    let store: Store;

    function openStore(limits: Partial<StorageLimits> = {}): Store {
      const subject = open({ ...DEFAULT_STORAGE_LIMITS, ...limits });
      opened.push(subject);
      return subject.store;
    }

    beforeEach(() => {
      opened = [];
      store = openStore();
    });

    afterEach(() => {
      for (const subject of opened) {
        subject.dispose();
      }
    });

    describe('sessions', () => {
      it('finds a saved session', () => {
        store.saveSession(session('session-1', 1_700_000_000_123));

        expect(store.findSession('session-1')).toEqual({ id: 'session-1', startedAt: 1_700_000_000_123 });
      });

      it('does not find a session that was never saved', () => {
        store.saveSession(session('session-1', 1));

        expect(store.findSession('session-2')).toBeUndefined();
      });

      it('knows whether a session holds a score', () => {
        store.saveSession(session('s1', 1));
        expect(store.isSessionUsed('s1')).toBe(false);

        store.addScore(record('s1', 'AAA', 10, 5));

        expect(store.isSessionUsed('s1')).toBe(true);
        expect(store.isSessionUsed('never-saved')).toBe(false);
      });
    });

    describe('addScore', () => {
      it('returns the stored score with rank 1 when the board is empty', () => {
        const ranked = store.addScore(record('s1', 'ABC', 700, 1_700_000_000_123));

        expect(ranked).toEqual({ rank: 1, initials: 'ABC', score: 700, achievedAt: 1_700_000_000_123 });
      });

      it('ranks a score as 1 plus the number of stored scores that sort before it', () => {
        const ranks = [
          store.addScore(record('s1', 'AAA', 100, 1_000)).rank,
          store.addScore(record('s2', 'BBB', 300, 2_000)).rank,
          store.addScore(record('s3', 'CCC', 200, 3_000)).rank,
          store.addScore(record('s4', 'DDD', 50, 4_000)).rank,
        ];

        expect(ranks).toEqual([1, 1, 2, 4]);
      });

      it('ranks an equal score behind the one that was achieved earlier', () => {
        store.addScore(record('s1', 'AAA', 500, 1_000));

        expect(store.addScore(record('s2', 'BBB', 500, 2_000)).rank).toBe(2);
      });

      it('ranks an equal score ahead of one that was achieved later but stored earlier', () => {
        store.addScore(record('s1', 'AAA', 500, 2_000));

        expect(store.addScore(record('s2', 'BBB', 500, 1_000)).rank).toBe(1);
      });

      it('ranks by insertion order when score and time are both equal', () => {
        const ranks = ['s1', 's2', 's3'].map((sessionId) => store.addScore(record(sessionId, 'AAA', 500, 1_000)).rank);

        expect(ranks).toEqual([1, 2, 3]);
      });

      it('rejects a second score for the same session and leaves the board untouched', () => {
        store.addScore(record('s1', 'AAA', 500, 1_000));

        expect(() => store.addScore(record('s1', 'BBB', 900, 2_000))).toThrow(SessionAlreadyUsedError);
        expect(() => store.addScore(record('s1', 'AAA', 500, 1_000))).toThrow(SessionAlreadyUsedError);
        expect(store.topScores(10)).toEqual([{ rank: 1, initials: 'AAA', score: 500, achievedAt: 1_000 }]);
      });
    });

    describe('recordings', () => {
      it('keeps the version and the recording a score was verified with', () => {
        store.addScore(record('s1', 'AAA', 500, 1_000, [1, 2, 3, 4]));

        expect([...store.storedRuns()]).toEqual([
          { id: expect.any(Number), initials: 'AAA', score: 500, engineVersion: ENGINE_VERSION, replay: [1, 2, 3, 4] },
        ]);
      });

      it('shows a score kept without one as having neither a version nor a recording', () => {
        store.addScore(record('s1', 'AAA', 500, 1_000));

        expect([...store.storedRuns()]).toEqual([
          { id: expect.any(Number), initials: 'AAA', score: 500, engineVersion: null, replay: null },
        ]);
      });

      it('hands the recordings over oldest first, whatever the ranking', () => {
        store.addScore(record('s1', 'LOW', 100, 1_000, [1, 1]));
        store.addScore(record('s2', 'TOP', 900, 2_000, [2, 1]));
        store.addScore(record('s3', 'MID', 500, 3_000, [3, 1]));

        expect([...store.storedRuns()].map((run) => run.initials)).toEqual(['LOW', 'TOP', 'MID']);
      });

      it('refuses a recording that is already kept, and the session it came with stays unused', () => {
        store.saveSession(session('s1', 1));
        store.saveSession(session('s2', 2));
        store.addScore(record('s1', 'AAA', 500, 1_000, [4, 4, 5, 5]));

        expect(() => store.addScore(record('s2', 'BBB', 500, 2_000, [4, 4, 5, 5]))).toThrow(DuplicateReplayError);

        expect(store.topScores(10)).toHaveLength(1);
        expect(store.isSessionUsed('s2')).toBe(false);
        expect(store.addScore(record('s2', 'BBB', 600, 3_000, [6, 6])).rank).toBe(1);
      });

      it('recognises a game by its effective replay alone, whatever else differs between two submissions', () => {
        store.addScore(record('s1', 'AAA', 500, 1_000, [4, 4, 5, 5]));

        expect(() => store.addScore(record('s2', 'ZZZ', 900, 9_000, [4, 4, 5, 5]))).toThrow(DuplicateReplayError);
      });

      it('tells two games apart by a single control', () => {
        store.addScore(record('s1', 'AAA', 500, 1_000, [4, 4, 5, 5]));

        expect(store.addScore(record('s2', 'BBB', 500, 2_000, [4, 4, 5, 6])).rank).toBe(2);
      });

      it('says the session was used when the session was used and the recording is a repeat too', () => {
        store.addScore(record('s1', 'AAA', 500, 1_000, [4, 4]));

        expect(() => store.addScore(record('s1', 'BBB', 500, 2_000, [4, 4]))).toThrow(SessionAlreadyUsedError);
      });

      it('lets scores that have no recording sit side by side', () => {
        store.addScore(record('s1', 'AAA', 500, 1_000));
        store.addScore(record('s2', 'BBB', 400, 2_000));

        expect(store.topScores(10)).toHaveLength(2);
      });

      it('lets a recording be submitted again once the score it was kept with has been removed', () => {
        store.addScore(record('s1', 'BAD', 500, 1_000, [4, 4]));
        store.deleteScores([...store.storedRuns()].map((run) => run.id));

        expect(store.addScore(record('s2', 'OKY', 500, 2_000, [4, 4])).rank).toBe(1);
      });
    });

    describe('topScores', () => {
      it('is empty when nothing was scored', () => {
        expect(store.topScores(10)).toEqual([]);
      });

      it('orders by score descending, then earliest achievement, then insertion order, ranking 1..N', () => {
        store.addScore(record('s1', 'LOW', 100, 1_000));
        store.addScore(record('s2', 'LAT', 500, 3_000));
        store.addScore(record('s3', 'TIE', 500, 2_000));
        store.addScore(record('s4', 'TOP', 900, 4_000));
        store.addScore(record('s5', 'ONE', 500, 2_000));
        store.addScore(record('s6', 'EAR', 500, 1_500));

        expect(store.topScores(10)).toEqual([
          { rank: 1, initials: 'TOP', score: 900, achievedAt: 4_000 },
          { rank: 2, initials: 'EAR', score: 500, achievedAt: 1_500 },
          { rank: 3, initials: 'TIE', score: 500, achievedAt: 2_000 },
          { rank: 4, initials: 'ONE', score: 500, achievedAt: 2_000 },
          { rank: 5, initials: 'LAT', score: 500, achievedAt: 3_000 },
          { rank: 6, initials: 'LOW', score: 100, achievedAt: 1_000 },
        ]);
      });

      it('returns no more than the limit, from the top', () => {
        store.addScore(record('s1', 'AAA', 100, 1_000));
        store.addScore(record('s2', 'BBB', 300, 2_000));
        store.addScore(record('s3', 'CCC', 200, 3_000));

        expect(store.topScores(2).map(({ rank, initials }) => ({ rank, initials }))).toEqual([
          { rank: 1, initials: 'BBB' },
          { rank: 2, initials: 'CCC' },
        ]);
        expect(store.topScores(1)).toHaveLength(1);
      });

      it('returns everything when the limit exceeds the number of scores', () => {
        store.addScore(record('s1', 'AAA', 100, 1_000));

        expect(store.topScores(100)).toHaveLength(1);
      });

      it('reports the same rank in the list as it did when the score was added', () => {
        const added = [store.addScore(record('s1', 'AAA', 100, 1_000)), store.addScore(record('s2', 'BBB', 500, 1_000))];

        // Only the first entry slipped down, so only its rank may differ from what addScore reported.
        expect(store.topScores(10)[0]).toEqual(added[1]);
        expect(store.topScores(10)[1]).toEqual({ ...added[0], rank: 2 });
      });
    });

    describe('the cap on scores', () => {
      it('keeps only the best scores', () => {
        const small = openStore({ maxScores: 3 });
        small.addScore(record('s1', 'AAA', 500, 1_000));
        small.addScore(record('s2', 'BBB', 400, 2_000));
        small.addScore(record('s3', 'CCC', 300, 3_000));

        small.addScore(record('s4', 'EEE', 450, 4_000));

        expect(small.topScores(10).map((entry) => entry.initials)).toEqual(['AAA', 'EEE', 'BBB']);
      });

      it('ranks a score that lands below the cut as where it would have been, without keeping it', () => {
        const small = openStore({ maxScores: 3 });
        small.addScore(record('s1', 'AAA', 500, 1_000));
        small.addScore(record('s2', 'BBB', 400, 2_000));
        small.addScore(record('s3', 'CCC', 300, 3_000));

        const below = small.addScore(record('s4', 'DDD', 200, 4_000));

        expect(below).toEqual({ rank: 4, initials: 'DDD', score: 200, achievedAt: 4_000 });
        expect(small.topScores(10).map((entry) => entry.initials)).toEqual(['AAA', 'BBB', 'CCC']);
      });

      it('settles a tie at the cut by achievement time, then by insertion order', () => {
        const small = openStore({ maxScores: 2 });
        small.addScore(record('s1', 'AAA', 500, 1_000));
        small.addScore(record('s2', 'BBB', 500, 1_000));

        const late = small.addScore(record('s3', 'CCC', 500, 1_000));
        expect(late.rank).toBe(3);
        expect(small.topScores(10).map((entry) => entry.initials)).toEqual(['AAA', 'BBB']);

        const early = small.addScore(record('s4', 'DDD', 500, 500));
        expect(early.rank).toBe(1);
        expect(small.topScores(10).map((entry) => entry.initials)).toEqual(['DDD', 'AAA']);
      });

      it('forgets the session of every score it drops, so that session cannot submit again', () => {
        const small = openStore({ maxScores: 2 });
        for (const [index, id] of ['s1', 's2', 's3', 's4'].entries()) {
          small.saveSession(session(id, index));
        }
        small.addScore(record('s1', 'AAA', 500, 1_000));
        small.addScore(record('s2', 'BBB', 300, 2_000));

        small.addScore(record('s3', 'CCC', 400, 3_000));
        small.addScore(record('s4', 'DDD', 100, 4_000));

        // BBB was pushed out by CCC, and DDD fell below the cut as it arrived.
        expect(small.findSession('s2')).toBeUndefined();
        expect(small.findSession('s4')).toBeUndefined();
        expect(small.findSession('s1')).toBeDefined();
        expect(small.findSession('s3')).toBeDefined();
      });

      it('keeps everything while there is room', () => {
        const small = openStore({ maxScores: 3 });

        small.addScore(record('s1', 'AAA', 500, 1_000));
        small.addScore(record('s2', 'BBB', 400, 2_000));

        expect(small.topScores(10)).toHaveLength(2);
      });

      it('lets a refused submission leave the board as it was', () => {
        const small = openStore({ maxScores: 2 });
        small.addScore(record('s1', 'AAA', 500, 1_000, [1, 1]));
        small.addScore(record('s2', 'BBB', 400, 2_000, [2, 2]));

        expect(() => small.addScore(record('s3', 'CCC', 900, 3_000, [1, 1]))).toThrow(DuplicateReplayError);

        expect(small.topScores(10).map((entry) => entry.initials)).toEqual(['AAA', 'BBB']);
      });
    });

    describe('the cap on sessions', () => {
      it('evicts the oldest unused session when the cap is reached', () => {
        const small = openStore({ maxSessions: 3 });
        small.saveSession(session('s1', 1));
        small.saveSession(session('s2', 2));
        small.saveSession(session('s3', 3));
        expect(small.findSession('s1')).toBeDefined();

        small.saveSession(session('s4', 4));

        expect(small.findSession('s1')).toBeUndefined();
        expect(['s2', 's3', 's4'].map((id) => small.findSession(id) !== undefined)).toEqual([true, true, true]);
      });

      it('settles sessions that started together in the order they were saved', () => {
        const small = openStore({ maxSessions: 3 });
        small.saveSession(session('a', 5));
        small.saveSession(session('b', 5));
        small.saveSession(session('c', 5));

        small.saveSession(session('d', 6));

        expect(small.findSession('a')).toBeUndefined();
        expect(small.findSession('b')).toBeDefined();
      });

      it('never evicts a session that holds a score', () => {
        const small = openStore({ maxSessions: 3 });
        small.saveSession(session('scored', 1));
        small.saveSession(session('s2', 2));
        small.saveSession(session('s3', 3));
        small.addScore(record('scored', 'AAA', 10, 5));

        small.saveSession(session('s4', 4));

        expect(small.findSession('scored')).toBeDefined();
        expect(small.findSession('s2')).toBeUndefined();
        expect(small.findSession('s3')).toBeDefined();
        expect(small.findSession('s4')).toBeDefined();
      });

      it('still stores the new session when every session it holds has a score', () => {
        const small = openStore({ maxSessions: 2 });
        small.saveSession(session('s1', 1));
        small.saveSession(session('s2', 2));
        small.addScore(record('s1', 'AAA', 10, 5));
        small.addScore(record('s2', 'BBB', 20, 6));

        small.saveSession(session('s3', 3));

        expect(['s1', 's2', 's3'].map((id) => small.findSession(id) !== undefined)).toEqual([true, true, true]);
      });
    });

    describe('moderation', () => {
      it('lists scores in leaderboard order with the id that removes each of them', () => {
        store.addScore(record('s1', 'LOW', 100, 1_000));
        store.addScore(record('s2', 'TOP', 900, 2_000));
        store.addScore(record('s3', 'MID', 500, 3_000));

        const listed = store.listScores(10);

        expect(listed.map(({ rank, initials, score, achievedAt }) => ({ rank, initials, score, achievedAt }))).toEqual(
          store.topScores(10),
        );
        expect(new Set(listed.map((entry) => entry.id)).size).toBe(3);
        expect(store.listScores(2)).toHaveLength(2);
      });

      it('removes scores by id together with their sessions, and says which ids existed', () => {
        store.saveSession(session('s1', 1));
        store.saveSession(session('s2', 2));
        store.addScore(record('s1', 'AAA', 500, 1_000));
        store.addScore(record('s2', 'BBB', 400, 2_000));
        const [top, second] = store.listScores(10);

        expect(store.deleteScores([top.id])).toEqual([top.id]);

        expect(store.topScores(10)).toEqual([{ rank: 1, initials: 'BBB', score: 400, achievedAt: 2_000 }]);
        expect(store.findSession('s1')).toBeUndefined();
        expect(store.findSession('s2')).toBeDefined();
        expect(store.listScores(10).map((entry) => entry.id)).toEqual([second.id]);
      });

      it('ignores ids that do not exist, and counts an id given twice once', () => {
        store.addScore(record('s1', 'AAA', 500, 1_000));
        const [only] = store.listScores(10);

        expect(store.deleteScores([only.id + 100, only.id, only.id])).toEqual([only.id]);
        expect(store.deleteScores([])).toEqual([]);
      });

      it('lets a removed score give up its place to those behind it', () => {
        store.addScore(record('s1', 'AAA', 500, 1_000));
        store.addScore(record('s2', 'BBB', 400, 2_000));
        store.addScore(record('s3', 'CCC', 300, 3_000));
        const [top] = store.listScores(10);

        store.deleteScores([top.id]);

        expect(store.topScores(10).map(({ rank, initials }) => ({ rank, initials }))).toEqual([
          { rank: 1, initials: 'BBB' },
          { rank: 2, initials: 'CCC' },
        ]);
      });
    });

    describe('deleteUnusedSessionsStartedBefore', () => {
      it('removes unused sessions that started before the cutoff', () => {
        store.saveSession(session('old', 999));

        store.deleteUnusedSessionsStartedBefore(1_000);

        expect(store.findSession('old')).toBeUndefined();
      });

      it('keeps sessions that started at or after the cutoff', () => {
        store.saveSession(session('boundary', 1_000));
        store.saveSession(session('recent', 1_001));

        store.deleteUnusedSessionsStartedBefore(1_000);

        expect(store.findSession('boundary')).toBeDefined();
        expect(store.findSession('recent')).toBeDefined();
      });

      it('keeps old sessions that received a score, so the score keeps its session', () => {
        store.saveSession(session('used', 1));
        store.addScore(record('used', 'AAA', 10, 5));
        store.saveSession(session('unused', 1));

        store.deleteUnusedSessionsStartedBefore(1_000);

        expect(store.findSession('used')).toBeDefined();
        expect(store.findSession('unused')).toBeUndefined();
        expect(() => store.addScore(record('used', 'BBB', 20, 6))).toThrow(SessionAlreadyUsedError);
      });

      it('leaves the scores alone', () => {
        store.saveSession(session('used', 1));
        store.addScore(record('used', 'AAA', 10, 5));

        store.deleteUnusedSessionsStartedBefore(1_000);

        expect(store.topScores(10)).toHaveLength(1);
      });

      it('does nothing on an empty store', () => {
        expect(() => store.deleteUnusedSessionsStartedBefore(1_000)).not.toThrow();
      });
    });
  });
}

describeLeaderboardStoreContract('InMemoryLeaderboardStore', (limits) => ({
  store: new InMemoryLeaderboardStore(limits),
  dispose: () => undefined,
}));

describeLeaderboardStoreContract('SqliteLeaderboardStore on :memory:', (limits) => {
  const store = new SqliteLeaderboardStore(':memory:', limits);
  return { store, dispose: () => store.close() };
});
