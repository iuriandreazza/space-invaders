import { createHash } from 'node:crypto';

export type SecurityEvent =
  | 'rate_limited'
  | 'unsupported_media_type'
  | 'payload_too_large'
  | 'submission_refused'
  | 'engine_error';

export type SecurityLogFields = Readonly<Record<string, string | number | boolean>>;

/**
 * Prints one JSON line per event. JSON.stringify escapes line breaks and quotes, so a value that came from a client
 * cannot forge a second line or break out of its field.
 * Callers pass only what is safe to keep: never a request body, an initial, or a session id (see logReference).
 */
export function logSecurityEvent(event: SecurityEvent, fields: SecurityLogFields = {}): void {
  console.warn(JSON.stringify({ time: new Date().toISOString(), event, ...fields }));
}

/**
 * A stand-in for a secret in the logs: it shows whether two lines are about the same value but is of no use to
 * anyone who wants to use the value. A session id is a bearer capability, and a refused submission leaves it valid.
 */
export function logReference(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 12);
}
