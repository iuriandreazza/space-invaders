import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { replayTicks } from '../../../shared/game/replay.ts';
import type {
  CreateSessionResponse,
  HealthResponse,
  LeaderboardEntry,
  SubmitScoreResponse,
  TopScoresResponse,
} from '../../../shared/leaderboard-contract.ts';
import type { LeaderboardService } from '../../application/leaderboard-service.ts';
import { parsePageSize } from '../../domain/page-size.ts';
import type { RankedScore } from '../../domain/score.ts';
import { parseScoreSubmission, type ScoreSubmission } from '../../domain/score-submission.ts';
import { logReference, type SecurityLogFields } from '../security-log.ts';
import { handleUnexpectedError, invalidRequest, jsonError, refusalFor, type Refusal } from './error-responses.ts';
import { createRequestGuards } from './request-guards.ts';
import { createSecurityEventRecorder } from './security-events.ts';
import type { ResolvedSecuritySettings } from './security-settings.ts';

/**
 * Only the route that takes a score is sent a body worth reading, so whatever any other route is sent is noise.
 * (GET requests never carry one to the application: the Node adapter does not hand over a body for them.)
 */
const MAX_STRAY_BODY_BYTES = 1024;
/**
 * Aiming with a mouse changes the controls far more often than a keyboard does, so a recording can hold many runs.
 * One with the most there may be (100,000, see `MAX_REPLAY_RUNS`) is about 700 KB of JSON, so this leaves room for the
 * rest of the request.
 */
const MAX_SCORE_BODY_BYTES = 1024 * 1024;

// Registered first and setting the header after next(), it also reaches the responses produced by the
// guards, the error handler and the unknown-route fallback.
const neverCache: MiddlewareHandler = async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
};

function toLeaderboardEntry({ rank, initials, score, achievedAt }: RankedScore): LeaderboardEntry {
  return { rank, initials, score, achievedAt: new Date(achievedAt).toISOString() };
}

// Unparseable JSON is reported by the submission parser like any other body that is not an object.
async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/** What the log may say about a refusal: why, and which submission it was, but never what it contained. */
function refusalLogFields({ code, reason }: Refusal, submission: ScoreSubmission | undefined): SecurityLogFields {
  return {
    code,
    ...(reason === undefined ? {} : { reason }),
    ...(submission === undefined
      ? {}
      : { session: logReference(submission.sessionId), ticks: replayTicks(submission.replay) }),
  };
}

export function createApiRoutes(service: LeaderboardService, security: ResolvedSecuritySettings, revision?: string): Hono {
  const record = createSecurityEventRecorder(security);
  const guards = createRequestGuards(security, record);
  const { rateLimits } = security;

  const refuse = (c: Context, refusal: Refusal, submission?: ScoreSubmission): Response => {
    record(c, 'submission_refused', refusalLogFields(refusal, submission));
    return jsonError(c, refusal.status, refusal.code, refusal.message);
  };

  const api = new Hono();

  api.use('*', neverCache);
  api.onError(handleUnexpectedError);

  const health: HealthResponse = revision === undefined ? { status: 'ok' } : { status: 'ok', revision };
  api.get('/health', (c) => c.json(health));

  api.post('/sessions', guards.limit(rateLimits.startSession), ...guards.jsonBody(MAX_STRAY_BODY_BYTES), (c) => {
    const body: CreateSessionResponse = { sessionId: service.startSession().id };
    return c.json(body, 201);
  });

  api.post('/scores', guards.limit(rateLimits.submitScore), ...guards.jsonBody(MAX_SCORE_BODY_BYTES), async (c) => {
    const submission = parseScoreSubmission(await readJsonBody(c));
    if (!submission.ok) {
      return refuse(c, invalidRequest(submission.message));
    }
    try {
      const body: SubmitScoreResponse = { entry: toLeaderboardEntry(service.submitScore(submission.value)) };
      return c.json(body, 201);
    } catch (error) {
      const refusal = refusalFor(error);
      if (refusal === undefined) {
        throw error;
      }
      return refuse(c, refusal, submission.value);
    }
  });

  api.get('/scores', guards.limit(rateLimits.topScores), (c) => {
    const pageSize = parsePageSize(c.req.query('limit'));
    if (!pageSize.ok) {
      return jsonError(c, 400, 'invalid_request', pageSize.message);
    }
    const body: TopScoresResponse = { entries: service.topScores(pageSize.value).map(toLeaderboardEntry) };
    return c.json(body);
  });

  // Registered last so unknown API routes never fall through to the single-page app.
  // Limited like a read: without it every oversized request to a made-up route would write a line to the log.
  api.all('*', guards.limit(rateLimits.topScores), guards.sizeLimit(MAX_STRAY_BODY_BYTES), (c) =>
    jsonError(c, 404, 'invalid_request', 'Unknown API route.'),
  );

  return api;
}
