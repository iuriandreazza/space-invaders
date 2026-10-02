import type { Context, MiddlewareHandler } from 'hono';
import { jsonError } from './error-responses.ts';

const JSON_MEDIA_TYPE = 'application/json';

/**
 * A request has a body when it says how long it is or announces chunks (RFC 9110, section 6.4.1). The body stream
 * cannot tell: Node hands one over for every POST, even an empty one.
 */
function carriesBody(c: Context): boolean {
  const contentLength = c.req.header('content-length');
  return c.req.header('transfer-encoding') !== undefined || (contentLength !== undefined && Number(contentLength) > 0);
}

/** Parameters such as the charset are allowed; the media type itself has to be exactly JSON. */
function isJson(contentType: string | undefined): boolean {
  return contentType?.split(';')[0]?.trim().toLowerCase() === JSON_MEDIA_TYPE;
}

export interface RequireJsonBodyOptions {
  readonly onRejected: (c: Context, contentType: string | undefined) => void;
}

/**
 * Refuses a body that is not declared as JSON. A browser can send a cross-site form or plain-text POST without asking
 * the server first, but never `application/json`, which needs a preflight that this API does not grant: so this closes
 * cross-site writes. A request without a body needs no content type.
 */
export function requireJsonBody({ onRejected }: RequireJsonBodyOptions): MiddlewareHandler {
  return async (c, next) => {
    const contentType = c.req.header('content-type');
    if (carriesBody(c) && !isJson(contentType)) {
      onRejected(c, contentType);
      return jsonError(c, 415, 'unsupported_media_type', 'The body must be sent as application/json.');
    }
    await next();
  };
}
