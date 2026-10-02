import { randomBytes } from 'node:crypto';

const SESSION_ID_BYTES = 16;

/**
 * A session id is a bearer capability: whoever holds it can spend the session's one score. It is 128 bits from the
 * operating system's random number generator (ASVS 11.5.1), which a UUID v4 is not quite: it has 122.
 */
export function createSessionId(): string {
  return randomBytes(SESSION_ID_BYTES).toString('base64url');
}
