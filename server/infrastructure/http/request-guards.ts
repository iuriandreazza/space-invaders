import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { jsonError } from './error-responses.ts';
import { rateLimit } from './rate-limit.ts';
import { requireJsonBody } from './require-json-body.ts';
import { routeOf, type SecurityEventRecorder } from './security-events.ts';
import type { ResolvedSecuritySettings } from './security-settings.ts';

/**
 * What a route puts in front of its handler, cheapest refusal first: the rate limit (it answers before the body is
 * touched, so a flood of junk costs as little as possible and every line it logs is bounded by the limit), then the
 * content type, then the size.
 */
export interface RequestGuards {
  /** Allows each client `perWindow` requests per window. */
  limit(perWindow: number): MiddlewareHandler;
  /** Refuses a body longer than `maxBytes`. */
  sizeLimit(maxBytes: number): MiddlewareHandler;
  /** For a route that takes a body: it has to be JSON and at most `maxBytes` long. */
  jsonBody(maxBytes: number): MiddlewareHandler[];
}

const MAX_LOGGED_CONTENT_TYPE_LENGTH = 100;

// Every line a guard logs carries the `code` of the answer it gave, like the lines about refused submissions do, so
// that one query finds all the refusals. None of these can say which session or how long a run, as the body was never read.
export function createRequestGuards(
  { rateLimits, clock, clientAddress }: ResolvedSecuritySettings,
  record: SecurityEventRecorder,
): RequestGuards {
  const sizeLimit: RequestGuards['sizeLimit'] = (maxBytes) =>
    bodyLimit({
      maxSize: maxBytes,
      onError: (c) => {
        record(c, 'payload_too_large', { code: 'payload_too_large', route: routeOf(c), limitBytes: maxBytes });
        return jsonError(c, 413, 'payload_too_large', 'Request body is too large.');
      },
    });

  return {
    limit: (perWindow) =>
      rateLimit({
        limit: perWindow,
        windowMs: rateLimits.windowMs,
        clock,
        clientAddress,
        onLimited: (c, retryAfter) => record(c, 'rate_limited', { code: 'rate_limited', route: routeOf(c), retryAfter }),
      }),
    sizeLimit,
    jsonBody: (maxBytes) => [
      requireJsonBody({
        onRejected: (c, contentType) =>
          record(c, 'unsupported_media_type', {
            code: 'unsupported_media_type',
            route: routeOf(c),
            // It is whatever the client chose to send, so it is cut short before it reaches the log.
            contentType: contentType?.slice(0, MAX_LOGGED_CONTENT_TYPE_LENGTH) ?? 'missing',
          }),
      }),
      sizeLimit(maxBytes),
    ],
  };
}
