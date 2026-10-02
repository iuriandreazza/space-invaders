import { DatabaseSync } from 'node:sqlite';
import { DuplicateReplayError, SessionAlreadyUsedError } from '../application/errors.ts';
import type { LeaderboardStore, ScoreModerationStore } from '../application/ports.ts';
import type { PlaySession } from '../domain/play-session.ts';
import type { ListedScore, RankedScore, ScoreRecord, StoredRun } from '../domain/score.ts';
import { DEFAULT_STORAGE_LIMITS, type StorageLimits } from '../domain/storage-limits.ts';
import { compressReplay, decompressReplay, replayFingerprint } from './replay-codec.ts';

const IN_MEMORY_DATABASE = ':memory:';

/** The server and the moderation CLI write to the same file, so a writer waits for the other instead of failing. */
const BUSY_TIMEOUT_MS = 5_000;

/** Extended result code of a violated UNIQUE constraint (https://sqlite.org/rescode.html#constraint_unique). */
const SQLITE_CONSTRAINT_UNIQUE = 2067;

// One order everywhere: the index, the listing, the rank count and the trim have to agree on it.
const RANKING_ORDER = 'score DESC, achieved_at ASC, id ASC';

/** The schema as it was before recordings were kept. Every later change is a migration, so old and new databases end up identical. */
const BASE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS play_sessions (
    id TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS play_sessions_started_at ON play_sessions (started_at);

  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    initials TEXT NOT NULL,
    score INTEGER NOT NULL,
    achieved_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS scores_ranking ON scores (${RANKING_ORDER});
`;

/**
 * Additive changes to the base schema, applied in order. `PRAGMA user_version` counts how many a database has had,
 * which is how a database from any earlier release catches up without losing a row.
 */
const MIGRATIONS: readonly string[] = [
  // 1: a score keeps the recording it was verified with. NULLs are distinct in a unique index, so the scores kept from
  // before recordings existed, which have none, do not collide with each other.
  `
    ALTER TABLE scores ADD COLUMN engine_version INTEGER;
    ALTER TABLE scores ADD COLUMN replay BLOB;
    ALTER TABLE scores ADD COLUMN replay_hash TEXT;
    CREATE UNIQUE INDEX scores_replay_hash ON scores (replay_hash);
  `,
];

/** The ids of every score past the first `?` in leaderboard order. */
const SCORES_BEYOND_THE_CAP = `SELECT id FROM scores ORDER BY ${RANKING_ORDER} LIMIT -1 OFFSET ?`;

// IMMEDIATE takes the write lock up front: a plain BEGIN could find another writer in the way halfway through.
function inTransaction<T>(database: DatabaseSync, work: () => T): T {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function schemaVersion(database: DatabaseSync): number {
  return (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
}

function migrate(database: DatabaseSync): void {
  if (schemaVersion(database) >= MIGRATIONS.length) {
    return;
  }
  inTransaction(database, () => {
    // Read again under the write lock: another process may have migrated while this one waited for it.
    for (let version = schemaVersion(database); version < MIGRATIONS.length; version += 1) {
      database.exec(MIGRATIONS[version]);
      database.exec(`PRAGMA user_version = ${version + 1}`);
    }
  });
}

// None of the queries that serve the leaderboard names the replay column: recordings are large and only moderation reads them.
function prepareStatements(database: DatabaseSync) {
  return {
    insertSession: database.prepare('INSERT INTO play_sessions (id, started_at) VALUES (?, ?)'),
    selectSession: database.prepare('SELECT id, started_at FROM play_sessions WHERE id = ?'),
    selectScoreOfSession: database.prepare('SELECT 1 FROM scores WHERE session_id = ?'),
    // Counting every session is a metadata lookup; counting only the unused ones scans the table on each request.
    countSessions: database.prepare('SELECT COUNT(*) AS total FROM play_sessions'),
    // Oldest first, ties by insertion order (rowid). A session that holds a score is never a candidate.
    deleteOldestUnusedSessions: database.prepare(`
      DELETE FROM play_sessions WHERE id IN (
        SELECT id FROM play_sessions
        WHERE NOT EXISTS (SELECT 1 FROM scores WHERE scores.session_id = play_sessions.id)
        ORDER BY started_at ASC, rowid ASC
        LIMIT ?
      )
    `),
    deleteUnusedSessionsStartedBefore: database.prepare(`
      DELETE FROM play_sessions
      WHERE started_at < ?
        AND NOT EXISTS (SELECT 1 FROM scores WHERE scores.session_id = play_sessions.id)
    `),
    insertScore: database.prepare(`
      INSERT INTO scores (session_id, initials, score, achieved_at, engine_version, replay, replay_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    // The three branches spell out RANKING_ORDER for "sorts before this one".
    countScoresAhead: database.prepare(`
      SELECT COUNT(*) AS total FROM scores
      WHERE score > ?1
         OR (score = ?1 AND achieved_at < ?2)
         OR (score = ?1 AND achieved_at = ?2 AND id < ?3)
    `),
    deleteSessionsBeyondTheCap: database.prepare(
      `DELETE FROM play_sessions WHERE id IN (SELECT session_id FROM scores WHERE id IN (${SCORES_BEYOND_THE_CAP}))`,
    ),
    deleteScoresBeyondTheCap: database.prepare(`DELETE FROM scores WHERE id IN (${SCORES_BEYOND_THE_CAP})`),
    selectScores: database.prepare(
      `SELECT id, initials, score, achieved_at FROM scores ORDER BY ${RANKING_ORDER} LIMIT ?`,
    ),
    selectRuns: database.prepare('SELECT id, initials, score, engine_version, replay FROM scores ORDER BY id'),
    deleteSessionOfScore: database.prepare(
      'DELETE FROM play_sessions WHERE id = (SELECT session_id FROM scores WHERE id = ?)',
    ),
    deleteScore: database.prepare('DELETE FROM scores WHERE id = ?'),
  };
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Error && 'errcode' in error && error.errcode === SQLITE_CONSTRAINT_UNIQUE;
}

export class SqliteLeaderboardStore implements LeaderboardStore, ScoreModerationStore {
  readonly #limits: StorageLimits;
  readonly #database: DatabaseSync;
  readonly #statements: ReturnType<typeof prepareStatements>;

  /** Pass ':memory:' for a throwaway database. */
  constructor(databasePath: string, limits: StorageLimits = DEFAULT_STORAGE_LIMITS) {
    this.#limits = limits;
    this.#database = new DatabaseSync(databasePath, { timeout: BUSY_TIMEOUT_MS });
    if (databasePath !== IN_MEMORY_DATABASE) {
      this.#database.exec('PRAGMA journal_mode = WAL');
    }
    this.#database.exec(BASE_SCHEMA);
    migrate(this.#database);
    this.#statements = prepareStatements(this.#database);
  }

  saveSession(session: PlaySession): void {
    this.#inTransaction(() => {
      this.#evictOldestUnusedSessions();
      this.#statements.insertSession.run(session.id, session.startedAt);
    });
  }

  findSession(sessionId: string): PlaySession | undefined {
    const row = this.#statements.selectSession.get(sessionId);
    return row === undefined ? undefined : { id: row.id as string, startedAt: row.started_at as number };
  }

  isSessionUsed(sessionId: string): boolean {
    return this.#statements.selectScoreOfSession.get(sessionId) !== undefined;
  }

  deleteUnusedSessionsStartedBefore(cutoff: number): void {
    this.#statements.deleteUnusedSessionsStartedBefore.run(cutoff);
  }

  addScore(record: ScoreRecord): RankedScore {
    return this.#inTransaction(() => {
      const id = this.#insertScoreRow(record);
      const { total } = this.#statements.countScoresAhead.get(record.score, record.achievedAt, id) as {
        total: number;
      };
      // The rank is read before the trim, so a score that lands below the cut is still told where it would have been.
      this.#forgetScoresBeyondTheCap();
      return { rank: total + 1, initials: record.initials, score: record.score, achievedAt: record.achievedAt };
    });
  }

  topScores(limit: number): RankedScore[] {
    return this.listScores(limit).map(({ rank, initials, score, achievedAt }) => ({
      rank,
      initials,
      score,
      achievedAt,
    }));
  }

  listScores(limit: number): ListedScore[] {
    return this.#statements.selectScores.all(limit).map((row, index) => ({
      id: row.id as number,
      rank: index + 1,
      initials: row.initials as string,
      score: row.score as number,
      achievedAt: row.achieved_at as number,
    }));
  }

  *storedRuns(): Generator<StoredRun> {
    for (const row of this.#statements.selectRuns.iterate()) {
      yield {
        id: row.id as number,
        initials: row.initials as string,
        score: row.score as number,
        engineVersion: row.engine_version as number | null,
        replay: row.replay === null ? null : decompressReplay(row.replay as Uint8Array),
      };
    }
  }

  deleteScores(ids: readonly number[]): number[] {
    return this.#inTransaction(() => {
      const deleted: number[] = [];
      for (const id of ids) {
        if (this.#forgetScore(id)) {
          deleted.push(id);
        }
      }
      return deleted;
    });
  }

  /** Safe to call more than once. */
  close(): void {
    if (this.#database.isOpen) {
      this.#database.close();
    }
  }

  #inTransaction<T>(work: () => T): T {
    return inTransaction(this.#database, work);
  }

  #evictOldestUnusedSessions(): void {
    const { total } = this.#statements.countSessions.get() as { total: number };
    // Leave room for the session about to be inserted.
    const excess = total - (this.#limits.maxSessions - 1);
    if (excess > 0) {
      this.#statements.deleteOldestUnusedSessions.run(excess);
    }
  }

  // The UNIQUE constraints, not a prior lookup, decide who wins when two submissions race.
  #insertScoreRow(record: ScoreRecord): number {
    const { replay } = record;
    try {
      const result = this.#statements.insertScore.run(
        record.sessionId,
        record.initials,
        record.score,
        record.achievedAt,
        record.engineVersion ?? null,
        replay === undefined ? null : compressReplay(replay),
        replay === undefined ? null : replayFingerprint(replay),
      );
      return Number(result.lastInsertRowid);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw this.#whyTheInsertWasRefused(record.sessionId);
      }
      throw error;
    }
  }

  // Both constraints raise the same error, so the table is asked which one it was. The write lock is held, so the
  // answer cannot change in between.
  #whyTheInsertWasRefused(sessionId: string): Error {
    return this.isSessionUsed(sessionId) ? new SessionAlreadyUsedError() : new DuplicateReplayError();
  }

  // A forgotten score takes its session with it: left behind, the session would look unused and could submit again.
  // The sessions go first because they are found through the scores.
  #forgetScoresBeyondTheCap(): void {
    this.#statements.deleteSessionsBeyondTheCap.run(this.#limits.maxScores);
    this.#statements.deleteScoresBeyondTheCap.run(this.#limits.maxScores);
  }

  #forgetScore(id: number): boolean {
    this.#statements.deleteSessionOfScore.run(id);
    return Number(this.#statements.deleteScore.run(id).changes) > 0;
  }
}
