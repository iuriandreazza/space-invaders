import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { logReference, logSecurityEvent } from './security-log.ts';

describe('logSecurityEvent', () => {
  let warn: MockInstance;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    vi.useRealTimers();
  });

  function printedLine(): string {
    expect(warn).toHaveBeenCalledTimes(1);
    return (warn.mock.calls[0] as [string])[0];
  }

  it('prints one line of JSON per event: its time, its name and its fields', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'));

    logSecurityEvent('rate_limited', { route: 'POST /api/scores', retryAfter: 42 });

    const line = printedLine();
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual({
      time: '2026-10-01T12:00:00.000Z',
      event: 'rate_limited',
      route: 'POST /api/scores',
      retryAfter: 42,
    });
  });

  it('prints an event that has no fields', () => {
    logSecurityEvent('payload_too_large');

    expect(JSON.parse(printedLine())).toMatchObject({ event: 'payload_too_large' });
  });

  it('cannot be made to print a second line, or to forge an event, by a value that came from a client', () => {
    const forged = 'text/plain\n{"time":"x","event":"rate_limited"}\r\n';

    logSecurityEvent('unsupported_media_type', { contentType: forged });

    const line = printedLine();
    expect(line.split(/\r?\n/)).toHaveLength(1);
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.event).toBe('unsupported_media_type');
    // The text is kept, harmlessly, inside its own field.
    expect(parsed.contentType).toBe(forged);
  });
});

describe('logReference', () => {
  it('is the same for the same secret and differs for another', () => {
    expect(logReference('session-1')).toBe(logReference('session-1'));
    expect(logReference('session-1')).not.toBe(logReference('session-2'));
  });

  it('is short hexadecimal text', () => {
    expect(logReference('session-1')).toMatch(/^[0-9a-f]{12}$/);
  });

  it('does not contain the secret', () => {
    const secret = '169f9c6c-3bf1-437a-af53-da5c4b7d1dc4';

    expect(logReference(secret)).not.toContain(secret.slice(0, 8));
  });
});
