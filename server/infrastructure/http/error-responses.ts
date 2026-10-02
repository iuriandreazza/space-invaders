import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorCode, ApiErrorResponse } from '../../../shared/leaderboard-contract.ts';
import {
  DuplicateReplayError,
  ImplausibleScoreError,
  InitialsNotAllowedError,
  InvalidReplayError,
  OutdatedClientError,
  ScoreMismatchError,
  SessionAlreadyUsedError,
  UnknownSessionError,
} from '../../application/errors.ts';

/**
 * The contract has no code for unknown routes, so those reuse `invalid_request` and it is the HTTP status that tells
 * them apart.
 */
export function jsonError(c: Context, status: ContentfulStatusCode, code: ApiErrorCode, message: string): Response {
  const body: ApiErrorResponse = { error: { code, message } };
  return c.json(body, status);
}

/** What the API answers when it refuses a submission. */
export interface Refusal {
  readonly status: ContentfulStatusCode;
  readonly code: ApiErrorCode;
  readonly message: string;
  /** Why, for the logs only: it is never sent to the client. */
  readonly reason?: string;
}

export function invalidRequest(message: string): Refusal {
  return { status: 400, code: 'invalid_request', message };
}

type ErrorClass = new (...args: never[]) => Error;

// One row for every way a use case can refuse a submission, and what the API makes of it. Nothing else turns into a
// 4xx: any other error is a fault of the server.
const REFUSALS: ReadonlyArray<readonly [ErrorClass, ContentfulStatusCode, ApiErrorCode]> = [
  [UnknownSessionError, 404, 'unknown_session'],
  [SessionAlreadyUsedError, 409, 'session_already_used'],
  [OutdatedClientError, 409, 'outdated_client'],
  [DuplicateReplayError, 409, 'duplicate_replay'],
  [InvalidReplayError, 422, 'invalid_replay'],
  [ScoreMismatchError, 422, 'score_mismatch'],
  [ImplausibleScoreError, 422, 'implausible_score'],
  [InitialsNotAllowedError, 422, 'initials_not_allowed'],
];

export function refusalFor(error: unknown): Refusal | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  const row = REFUSALS.find(([errorClass]) => error instanceof errorClass);
  if (row === undefined) {
    return undefined;
  }
  const [, status, code] = row;
  return { status, code, message: error.message, reason: error instanceof InvalidReplayError ? error.reason : undefined };
}

export function handleUnexpectedError(error: Error, c: Context): Response {
  // The cause may mention paths or SQL, so it goes to the log and never to the client.
  console.error('Unexpected error while handling an API request:', error);
  return jsonError(c, 500, 'internal_error', 'Internal server error.');
}
