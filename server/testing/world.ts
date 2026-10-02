import type { Hono } from 'hono';
import { expect } from 'vitest';
import type {
  ApiErrorCode,
  ApiErrorResponse,
  CreateSessionResponse,
  LeaderboardEntry,
  SubmitScoreResponse,
  TopScoresResponse,
} from '../../shared/leaderboard-contract.ts';
import type { StorageLimits } from '../domain/storage-limits.ts';
import type { InMemoryLeaderboardStore } from '../infrastructure/in-memory-leaderboard-store.ts';
import { createApp } from '../infrastructure/http/create-app.ts';
import type { SecuritySettings } from '../infrastructure/http/security-settings.ts';
import { createTestService, type FakeRunVerifier, type ManualClock } from './fakes.ts';
import { buildSubmitScoreRequest } from './requests.ts';

/** Test support: the whole API on a fake clock and a fake verifier, and the helpers to talk to it. */
export interface World {
  readonly app: Hono;
  readonly clock: ManualClock;
  readonly verifier: FakeRunVerifier;
  readonly store: InMemoryLeaderboardStore;
}

export interface WorldOptions {
  readonly staticDir?: string;
  readonly security?: SecuritySettings;
  readonly limits?: StorageLimits;
  readonly revision?: string;
}

export function createWorld({ staticDir, security, limits, revision }: WorldOptions = {}): World {
  const { service, store, clock, verifier } = createTestService(limits);
  // The limiter shares the clock of the service, so that advancing it moves the rate-limit windows too.
  const app = createApp({ service, staticDir, security: { clock, ...security }, revision });
  return { app, clock, verifier, store };
}

/** Sends the body the way a real client does: with its length, which is how the API knows a body is there. */
export async function sendRaw(
  app: Hono,
  method: string,
  path: string,
  body?: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const framing = body === undefined ? {} : { 'content-length': String(Buffer.byteLength(body)) };
  return await app.request(path, { method, headers: { 'content-type': 'application/json', ...framing, ...headers }, body });
}

export async function send(app: Hono, method: string, path: string, body?: unknown): Promise<Response> {
  return await sendRaw(app, method, path, body === undefined ? undefined : JSON.stringify(body));
}

export async function startSession(app: Hono): Promise<string> {
  const response = await send(app, 'POST', '/api/sessions');
  return ((await response.json()) as CreateSessionResponse).sessionId;
}

/** Submits a run that the fake verifier takes for a finished game scoring `score`. */
export async function submitScore(
  { app, verifier }: World,
  sessionId: string,
  initials: string,
  score: number,
): Promise<Response> {
  const request = buildSubmitScoreRequest({ sessionId, initials, score, replay: verifier.recordRun(score) });
  return await send(app, 'POST', '/api/scores', request);
}

/** Plays a whole run: starts a session and submits straight away. */
export async function recordScore(world: World, initials: string, score: number): Promise<LeaderboardEntry> {
  const sessionId = await startSession(world.app);
  const response = await submitScore(world, sessionId, initials, score);
  expect(response.status).toBe(201);
  return ((await response.json()) as SubmitScoreResponse).entry;
}

export async function listScores(app: Hono, query = ''): Promise<LeaderboardEntry[]> {
  const response = await send(app, 'GET', `/api/scores${query}`);
  expect(response.status).toBe(200);
  return ((await response.json()) as TopScoresResponse).entries;
}

export async function expectApiError(response: Response, status: number, code: ApiErrorCode): Promise<ApiErrorResponse> {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('content-type')).toContain('application/json');
  const body = (await response.json()) as ApiErrorResponse;
  expect(body.error.code).toBe(code);
  expect(body.error.message).not.toBe('');
  return body;
}
