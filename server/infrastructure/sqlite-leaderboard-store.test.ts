import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../../shared/game/replay.ts';
import { DuplicateReplayError, SessionAlreadyUsedError } from '../application/errors.ts';
import { SqliteLeaderboardStore } from './sqlite-leaderboard-store.ts';

/**
 * The schema of the databases that exist on developers' machines, from before recordings were kept. It is written out
 * here on purpose instead of imported: if the store's own base schema drifted, this copy would still be the truth.
 */
const SCHEMA_BEFORE_RECORDINGS = `
  CREATE TABLE play_sessions (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL);
  CREATE INDEX play_sessions_started_at ON play_sessions (started_at);
  CREATE TABLE scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    initials TEXT NOT NULL,
    score INTEGER NOT NULL,
    achieved_at INTEGER NOT NULL
  );
  CREATE INDEX scores_ranking ON scores (score DESC, achieved_at ASC, id ASC);
`;

function createDatabaseFromBeforeRecordings(path: string): void {
  const legacy = new DatabaseSync(path);
  legacy.exec(SCHEMA_BEFORE_RECORDINGS);
  legacy.exec(`
    INSERT INTO play_sessions (id, started_at) VALUES ('old-1', 1700000000000), ('old-2', 1700000001000), ('open', 1700000002000);
    INSERT INTO scores (session_id, initials, score, achieved_at)
      VALUES ('old-1', 'OLD', 900, 1700000005000), ('old-2', 'ELD', 500, 1700000006000);
  `);
  legacy.close();
}

/** What a database looks like from the outside: its columns and its indexes. */
function shapeOf(path: string) {
  const inspector = new DatabaseSync(path);
  try {
    const columns = (table: string) =>
      inspector
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk }));
    const indexes = (table: string) =>
      inspector
        .prepare(`PRAGMA index_list(${table})`)
        .all()
        .map(({ name, unique }) => ({ name, unique }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const { user_version: userVersion } = inspector.prepare('PRAGMA user_version').get() as { user_version: number };
    return {
      userVersion,
      sessions: columns('play_sessions'),
      scores: columns('scores'),
      sessionIndexes: indexes('play_sessions'),
      scoreIndexes: indexes('scores'),
    };
  } finally {
    inspector.close();
  }
}

describe('SqliteLeaderboardStore on a database file', () => {
  let directory: string;
  let databasePath: string;
  let openedStores: SqliteLeaderboardStore[];

  function openStore(path = databasePath): SqliteLeaderboardStore {
    const store = new SqliteLeaderboardStore(path);
    openedStores.push(store);
    return store;
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'space-invaders-store-'));
    databasePath = join(directory, 'leaderboard.sqlite');
    openedStores = [];
  });

  afterEach(() => {
    // Windows cannot delete a file that is still open, so every handle goes first.
    for (const store of openedStores) {
      store.close();
    }
    rmSync(directory, { recursive: true, force: true });
  });

  it('can be closed more than once', () => {
    const store = openStore();

    store.close();

    expect(() => store.close()).not.toThrow();
  });

  it('keeps sessions and scores after being closed and reopened', () => {
    const first = openStore();
    first.saveSession({ id: 'session-1', startedAt: 1_700_000_000_000 });
    first.addScore({ sessionId: 'session-1', initials: 'ABC', score: 700, achievedAt: 1_700_000_005_000 });
    first.close();

    const reopened = openStore();

    expect(reopened.findSession('session-1')).toEqual({ id: 'session-1', startedAt: 1_700_000_000_000 });
    expect(reopened.topScores(10)).toEqual([
      { rank: 1, initials: 'ABC', score: 700, achievedAt: 1_700_000_005_000 },
    ]);
    expect(() =>
      reopened.addScore({ sessionId: 'session-1', initials: 'ZZZ', score: 1, achievedAt: 1_700_000_006_000 }),
    ).toThrow(SessionAlreadyUsedError);
  });

  it('keeps ranking new scores correctly after being reopened', () => {
    const first = openStore();
    first.addScore({ sessionId: 's1', initials: 'AAA', score: 500, achievedAt: 1_000 });
    first.close();

    const reopened = openStore();

    expect(reopened.addScore({ sessionId: 's2', initials: 'BBB', score: 500, achievedAt: 1_000 }).rank).toBe(2);
  });

  it('keeps the recordings after being closed and reopened, and still refuses a recording it has', () => {
    const first = openStore();
    first.addScore({ sessionId: 's1', initials: 'AAA', score: 500, achievedAt: 1_000, engineVersion: ENGINE_VERSION, replay: [16, 4, 0, 9] });
    first.close();

    const reopened = openStore();

    expect([...reopened.storedRuns()]).toEqual([
      { id: 1, initials: 'AAA', score: 500, engineVersion: ENGINE_VERSION, replay: [16, 4, 0, 9] },
    ]);
    expect(() =>
      reopened.addScore({ sessionId: 's2', initials: 'BBB', score: 500, achievedAt: 2_000, engineVersion: ENGINE_VERSION, replay: [16, 4, 0, 9] }),
    ).toThrow(DuplicateReplayError);
  });

  it('creates the database file with write-ahead logging', () => {
    openStore();
    const inspector = new DatabaseSync(databasePath);

    try {
      expect(inspector.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    } finally {
      inspector.close();
    }
  });

  it('lets two connections to the same file share their data', () => {
    const writer = openStore();
    const reader = openStore();

    writer.saveSession({ id: 'session-1', startedAt: 1 });

    expect(reader.findSession('session-1')).toEqual({ id: 'session-1', startedAt: 1 });
  });

  describe('when two connections race', () => {
    function race(attempts: Array<() => unknown>): string[] {
      return attempts.map((attempt) => {
        try {
          attempt();
          return 'stored';
        } catch (error) {
          if (error instanceof SessionAlreadyUsedError) return 'session already used';
          if (error instanceof DuplicateReplayError) return 'duplicate replay';
          return 'failed';
        }
      });
    }

    it('lets exactly one win the same session', () => {
      const first = openStore();
      const second = openStore();
      const score = { sessionId: 'contested', initials: 'AAA', score: 100, achievedAt: 1_000 };

      const outcomes = race([() => first.addScore(score), () => second.addScore(score)]);

      expect(outcomes).toEqual(['stored', 'session already used']);
      expect(first.topScores(10)).toHaveLength(1);
    });

    it('lets exactly one win the same recording, and the other keeps its session', () => {
      const first = openStore();
      const second = openStore();
      const withRecording = (sessionId: string) => ({
        sessionId,
        initials: 'AAA',
        score: 100,
        achievedAt: 1_000,
        engineVersion: ENGINE_VERSION,
        replay: [1, 1, 2, 2],
      });

      const outcomes = race([() => first.addScore(withRecording('s1')), () => second.addScore(withRecording('s2'))]);

      expect(outcomes).toEqual(['stored', 'duplicate replay']);
      expect(second.isSessionUsed('s2')).toBe(false);
    });
  });

  it('has the database itself reject a second score for a session, whoever writes it', () => {
    const store = openStore();
    store.addScore({ sessionId: 'session-1', initials: 'AAA', score: 100, achievedAt: 1_000 });
    const intruder = new DatabaseSync(databasePath);

    try {
      expect(() =>
        intruder
          .prepare('INSERT INTO scores (session_id, initials, score, achieved_at) VALUES (?, ?, ?, ?)')
          .run('session-1', 'ZZZ', 999, 2_000),
      ).toThrow(/UNIQUE/);
    } finally {
      intruder.close();
    }
  });

  it('has the database itself reject a recording kept twice, while scores without one may repeat', () => {
    openStore();
    const intruder = new DatabaseSync(databasePath);
    const insert = intruder.prepare(
      'INSERT INTO scores (session_id, initials, score, achieved_at, engine_version, replay_hash) VALUES (?, ?, ?, ?, ?, ?)',
    );

    try {
      insert.run('a', 'AAA', 1, 1, ENGINE_VERSION, 'same-fingerprint');
      expect(() => insert.run('b', 'BBB', 2, 2, ENGINE_VERSION, 'same-fingerprint')).toThrow(/UNIQUE/);
      insert.run('c', 'CCC', 3, 3, null, null);
      expect(() => insert.run('d', 'DDD', 4, 4, null, null)).not.toThrow();
    } finally {
      intruder.close();
    }
  });

  it('never reads a recording to serve the leaderboard', () => {
    const store = openStore();
    store.addScore({ sessionId: 's1', initials: 'AAA', score: 500, achievedAt: 1_000, engineVersion: ENGINE_VERSION, replay: [1, 1, 2, 2] });
    const intruder = new DatabaseSync(databasePath);
    // Not a valid gzip stream: whatever tried to unpack it would throw.
    intruder.exec("UPDATE scores SET replay = x'00'");
    intruder.close();

    expect(store.topScores(10)).toHaveLength(1);
    expect(store.listScores(10)).toHaveLength(1);
    expect(store.addScore({ sessionId: 's2', initials: 'BBB', score: 400, achievedAt: 2_000 }).rank).toBe(2);
    expect(() => [...store.storedRuns()]).toThrow();
  });

  describe('migrating a database from before recordings were kept', () => {
    beforeEach(() => {
      createDatabaseFromBeforeRecordings(databasePath);
    });

    it('brings it up to date without losing a row', () => {
      const store = openStore();

      expect(store.listScores(10)).toEqual([
        { id: 1, rank: 1, initials: 'OLD', score: 900, achievedAt: 1_700_000_005_000 },
        { id: 2, rank: 2, initials: 'ELD', score: 500, achievedAt: 1_700_000_006_000 },
      ]);
      expect(store.findSession('open')).toEqual({ id: 'open', startedAt: 1_700_000_002_000 });
      expect(store.isSessionUsed('old-1')).toBe(true);
      expect(shapeOf(databasePath).userVersion).toBe(1);
    });

    it('lists the old scores as having neither a version nor a recording', () => {
      const store = openStore();

      expect([...store.storedRuns()]).toEqual([
        { id: 1, initials: 'OLD', score: 900, engineVersion: null, replay: null },
        { id: 2, initials: 'ELD', score: 500, engineVersion: null, replay: null },
      ]);
    });

    it('ranks new scores among the old ones and keeps the recordings of the new ones', () => {
      const store = openStore();

      const ranked = store.addScore({
        sessionId: 'open',
        initials: 'NEW',
        score: 700,
        achievedAt: 1_700_000_010_000,
        engineVersion: ENGINE_VERSION,
        replay: [1, 1, 2, 2],
      });

      expect(ranked.rank).toBe(2);
      expect([...store.storedRuns()].map((run) => run.replay)).toEqual([null, null, [1, 1, 2, 2]]);
    });

    it('lets the old scores, which have no recording, sit beside each other and beside new ones without one', () => {
      const store = openStore();

      store.addScore({ sessionId: 'open', initials: 'NEW', score: 100, achievedAt: 1_700_000_010_000 });

      expect(store.topScores(10)).toHaveLength(3);
    });

    it('ends in the very schema a new database starts with', () => {
      openStore().close();
      const fresh = join(directory, 'fresh.sqlite');
      openStore(fresh).close();

      expect(shapeOf(databasePath)).toEqual(shapeOf(fresh));
      expect(shapeOf(fresh).scores.map((column) => column.name)).toEqual([
        'id',
        'session_id',
        'initials',
        'score',
        'achieved_at',
        'engine_version',
        'replay',
        'replay_hash',
      ]);
    });

    it('leaves a database that is up to date alone', () => {
      openStore().close();
      const before = shapeOf(databasePath);

      const reopened = openStore();

      expect(shapeOf(databasePath)).toEqual(before);
      expect(reopened.topScores(10)).toHaveLength(2);
    });
  });
});

describe('SqliteLeaderboardStore on :memory:', () => {
  it('gives every store its own empty database', () => {
    const first = new SqliteLeaderboardStore(':memory:');
    const second = new SqliteLeaderboardStore(':memory:');

    try {
      first.addScore({ sessionId: 's1', initials: 'AAA', score: 100, achievedAt: 1_000 });

      expect(second.topScores(10)).toEqual([]);
    } finally {
      first.close();
      second.close();
    }
  });
});
