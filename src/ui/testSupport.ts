import { vi } from 'vitest';
import type { LeaderboardEntry } from '../../shared/leaderboard-contract.ts';
import type {
  ConsentDecision,
  ConsentStore,
  LeaderboardPort,
  Preferences,
  RunResult,
  RunningGame,
} from '../application/ports.ts';
import type { AppServices } from './services.ts';

/** A replay that is only good enough to be passed along: the fakes never look inside it. */
export const STUB_REPLAY = [1, 1];

export function entry(rank: number, initials: string, score: number): LeaderboardEntry {
  return { rank, initials, score, achievedAt: '2026-10-01T12:00:00.000Z' };
}

export class FakeLeaderboard implements LeaderboardPort {
  entries: LeaderboardEntry[] = [];
  startSession = vi.fn<LeaderboardPort['startSession']>(async () => 'session-1');
  submitScore = vi.fn<LeaderboardPort['submitScore']>(async ({ initials, run }) => {
    const saved = entry(1, initials, run.score);
    this.entries = [saved, ...this.entries];
    return saved;
  });
  topScores = vi.fn<LeaderboardPort['topScores']>(async () => this.entries);
}

export class FakePreferences implements Preferences {
  initials = '';
  muted = false;
  loadInitials = vi.fn(() => this.initials);
  saveInitials = vi.fn((initials: string) => {
    this.initials = initials;
  });
  loadMuted = vi.fn(() => this.muted);
  saveMuted = vi.fn((muted: boolean) => {
    this.muted = muted;
  });
}

/** A visitor who has already declined, so that no banner gets in the way of the tests that are about something else. */
export class FakeConsentStore implements ConsentStore {
  decision: ConsentDecision | null = 'declined';
  load = vi.fn(() => this.decision);
  save = vi.fn((decision: ConsentDecision) => {
    this.decision = decision;
  });
}

export interface FakeGame extends RunningGame {
  finish(score: number): void;
}

/** Services whose games never touch a canvas, keyboard or speaker; a test ends them with `finish`. */
export function createFakeServices() {
  const leaderboard = new FakeLeaderboard();
  const preferences = new FakePreferences();
  const consent = new FakeConsentStore();
  const analytics = { start: vi.fn(), stop: vi.fn() };
  const games: FakeGame[] = [];
  const services: AppServices = {
    leaderboard,
    preferences,
    consent,
    analytics,
    startGame: (_canvas, onGameOver) => {
      const game: FakeGame = {
        pause: vi.fn(),
        resume: vi.fn(),
        setMuted: vi.fn(),
        dispose: vi.fn(),
        finish: (score) => onGameOver({ score, replay: STUB_REPLAY } satisfies RunResult),
      };
      games.push(game);
      return game;
    },
  };
  return { services, leaderboard, preferences, consent, analytics, games };
}
