import { DuplicateReplayError, SessionAlreadyUsedError } from '../application/errors.ts';
import type { LeaderboardStore, ScoreModerationStore } from '../application/ports.ts';
import type { PlaySession } from '../domain/play-session.ts';
import type { ListedScore, RankedScore, ScoreRecord, StoredRun } from '../domain/score.ts';
import { DEFAULT_STORAGE_LIMITS, type StorageLimits } from '../domain/storage-limits.ts';
import { replayFingerprint } from './replay-codec.ts';

interface StoredScore extends ScoreRecord {
  readonly id: number;
  readonly fingerprint?: string;
}

/** Negative when `a` ranks above `b`: higher score first, then earlier achievement, then earlier insertion. */
function compareRanking(a: StoredScore, b: StoredScore): number {
  return b.score - a.score || a.achievedAt - b.achievedAt || a.id - b.id;
}

function toRankedScore(stored: StoredScore, rank: number): RankedScore {
  return { rank, initials: stored.initials, score: stored.score, achievedAt: stored.achievedAt };
}

function toListedScore(stored: StoredScore, rank: number): ListedScore {
  return { id: stored.id, ...toRankedScore(stored, rank) };
}

function toStoredRun(stored: StoredScore): StoredRun {
  return {
    id: stored.id,
    initials: stored.initials,
    score: stored.score,
    engineVersion: stored.engineVersion ?? null,
    replay: stored.replay ?? null,
  };
}

export class InMemoryLeaderboardStore implements LeaderboardStore, ScoreModerationStore {
  readonly #limits: StorageLimits;
  readonly #sessions = new Map<string, PlaySession>();
  readonly #scores: StoredScore[] = [];
  #lastScoreId = 0;

  constructor(limits: StorageLimits = DEFAULT_STORAGE_LIMITS) {
    this.#limits = limits;
  }

  saveSession(session: PlaySession): void {
    this.#evictOldestUnusedSessions(this.#sessions.size - (this.#limits.maxSessions - 1));
    this.#sessions.set(session.id, session);
  }

  findSession(sessionId: string): PlaySession | undefined {
    return this.#sessions.get(sessionId);
  }

  isSessionUsed(sessionId: string): boolean {
    return this.#sessionHasScore(sessionId);
  }

  deleteUnusedSessionsStartedBefore(cutoff: number): void {
    const usedSessionIds = this.#usedSessionIds();
    for (const session of this.#sessions.values()) {
      if (session.startedAt < cutoff && !usedSessionIds.has(session.id)) {
        this.#sessions.delete(session.id);
      }
    }
  }

  addScore(record: ScoreRecord): RankedScore {
    if (this.#sessionHasScore(record.sessionId)) {
      throw new SessionAlreadyUsedError();
    }
    const fingerprint = record.replay === undefined ? undefined : replayFingerprint(record.replay);
    if (fingerprint !== undefined && this.#scores.some((stored) => stored.fingerprint === fingerprint)) {
      throw new DuplicateReplayError();
    }
    const stored: StoredScore = { ...record, fingerprint, id: (this.#lastScoreId += 1) };
    this.#scores.push(stored);
    const scoresAhead = this.#scores.filter((other) => compareRanking(other, stored) < 0).length;
    // The rank is read before the trim, so a score that lands below the cut is still told where it would have been.
    this.#forgetScoresBeyondTheCap();
    return toRankedScore(stored, scoresAhead + 1);
  }

  topScores(limit: number): RankedScore[] {
    return this.#bestFirst(limit).map((stored, index) => toRankedScore(stored, index + 1));
  }

  listScores(limit: number): ListedScore[] {
    return this.#bestFirst(limit).map((stored, index) => toListedScore(stored, index + 1));
  }

  *storedRuns(): Generator<StoredRun> {
    for (const stored of [...this.#scores]) {
      yield toStoredRun(stored);
    }
  }

  deleteScores(ids: readonly number[]): number[] {
    const deleted: number[] = [];
    for (const id of ids) {
      const stored = this.#scores.find((candidate) => candidate.id === id);
      if (stored !== undefined) {
        this.#forget(stored);
        deleted.push(id);
      }
    }
    return deleted;
  }

  #sessionHasScore(sessionId: string): boolean {
    return this.#scores.some((stored) => stored.sessionId === sessionId);
  }

  #bestFirst(limit: number): StoredScore[] {
    return [...this.#scores].sort(compareRanking).slice(0, limit);
  }

  #usedSessionIds(): Set<string> {
    return new Set(this.#scores.map((stored) => stored.sessionId));
  }

  #evictOldestUnusedSessions(count: number): void {
    if (count <= 0) {
      return;
    }
    const usedSessionIds = this.#usedSessionIds();
    // sort() is stable, so sessions that started at the same instant go in the order they were saved.
    const unusedOldestFirst = [...this.#sessions.values()]
      .filter((session) => !usedSessionIds.has(session.id))
      .sort((a, b) => a.startedAt - b.startedAt);
    for (const session of unusedOldestFirst.slice(0, count)) {
      this.#sessions.delete(session.id);
    }
  }

  #forgetScoresBeyondTheCap(): void {
    if (this.#scores.length <= this.#limits.maxScores) {
      return;
    }
    for (const stored of [...this.#scores].sort(compareRanking).slice(this.#limits.maxScores)) {
      this.#forget(stored);
    }
  }

  // A forgotten score takes its session with it: left behind, the session would look unused and could submit again.
  #forget(stored: StoredScore): void {
    this.#scores.splice(this.#scores.indexOf(stored), 1);
    this.#sessions.delete(stored.sessionId);
  }
}
