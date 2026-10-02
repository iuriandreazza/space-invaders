import {
  DEFAULT_PAGE_SIZE,
  type ApiErrorResponse,
  type CreateSessionResponse,
  type LeaderboardEntry,
  type SubmitScoreRequest,
  type SubmitScoreResponse,
  type TopScoresResponse,
} from '../../../shared/leaderboard-contract.ts';
import { ENGINE_VERSION } from '../../../shared/game/replay.ts';
import { LeaderboardError, type LeaderboardPort, type SubmitScoreInput } from '../../application/ports.ts';

type Fetch = typeof fetch;

/** Long enough for a slow connection, short enough that a stuck server does not leave the screens waiting forever. */
const REQUEST_TIMEOUT_MS = 15_000;

export class HttpLeaderboard implements LeaderboardPort {
  private readonly baseUrl: string;
  private readonly fetchImpl: Fetch;
  private readonly timeoutMs: number;

  constructor(baseUrl = '/api', fetchImpl: Fetch = globalThis.fetch.bind(globalThis), timeoutMs = REQUEST_TIMEOUT_MS) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async startSession(): Promise<string> {
    const { sessionId } = await this.request<CreateSessionResponse>('/sessions', { method: 'POST' });
    return sessionId;
  }

  async submitScore({ sessionId, initials, run }: SubmitScoreInput): Promise<LeaderboardEntry> {
    const body: SubmitScoreRequest = {
      sessionId,
      initials,
      score: run.score,
      engineVersion: ENGINE_VERSION,
      replay: [...run.replay],
    };
    const { entry } = await this.request<SubmitScoreResponse>('/scores', { method: 'POST', body });
    return entry;
  }

  async topScores(limit = DEFAULT_PAGE_SIZE): Promise<LeaderboardEntry[]> {
    const { entries } = await this.request<TopScoresResponse>(`/scores?limit=${limit}`);
    return entries;
  }

  private async request<T>(path: string, options: { method?: 'POST'; body?: unknown } = {}): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new LeaderboardError('network', 'The leaderboard cannot be reached.');
    }

    if (!response.ok) throw await toLeaderboardError(response);
    try {
      return (await response.json()) as T;
    } catch {
      throw new LeaderboardError('unexpected', 'The leaderboard sent an answer that could not be read.');
    }
  }
}

async function toLeaderboardError(response: Response): Promise<LeaderboardError> {
  try {
    const { error } = (await response.json()) as ApiErrorResponse;
    return new LeaderboardError(error.code, error.message);
  } catch {
    return new LeaderboardError('unexpected', `The leaderboard answered with HTTP ${response.status}.`);
  }
}
