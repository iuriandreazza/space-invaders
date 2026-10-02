/** Wire format shared by the web client and the API. Keep it free of runtime dependencies. */

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export interface LeaderboardEntry {
  rank: number;
  initials: string;
  score: number;
  /** ISO-8601 timestamp of when the score was recorded. */
  achievedAt: string;
}

export interface HealthResponse {
  status: 'ok';
  /** The commit the server was built from, when the build says so. It lets a deploy prove which version answers. */
  revision?: string;
}

export interface CreateSessionResponse {
  sessionId: string;
}

export interface SubmitScoreRequest {
  sessionId: string;
  initials: string;
  /** What the player saw at game over. The server plays the run again and only accepts the same number. */
  score: number;
  /** Version of the game rules the run was played with (`ENGINE_VERSION`). */
  engineVersion: number;
  /** The controls held on every tick of the whole game: see `shared/game/replay.ts`. */
  replay: number[];
}

export interface SubmitScoreResponse {
  entry: LeaderboardEntry;
}

export interface TopScoresResponse {
  entries: LeaderboardEntry[];
}

export type ApiErrorCode =
  | 'invalid_request'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'rate_limited'
  | 'unknown_session'
  | 'session_already_used'
  | 'implausible_score'
  | 'initials_not_allowed'
  | 'invalid_replay'
  | 'score_mismatch'
  | 'outdated_client'
  | 'duplicate_replay'
  | 'internal_error';

export interface ApiErrorResponse {
  error: { code: ApiErrorCode; message: string };
}
