import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { HTTP_SERVER_LIMITS } from './server-limits.ts';

describe('HTTP_SERVER_LIMITS', () => {
  it('is what Node applies to a server built with it', () => {
    const server = createServer(HTTP_SERVER_LIMITS);

    expect(server.headersTimeout).toBe(10_000);
    expect(server.requestTimeout).toBe(15_000);
    expect(server.keepAliveTimeout).toBe(5_000);
    // Not part of Node's typings of a server, though the server does hold it.
    expect((server as unknown as Record<string, unknown>).connectionsCheckingInterval).toBe(2_000);
  });

  it('gives the headers less time than the whole request, which Node insists on', () => {
    expect(() => createServer(HTTP_SERVER_LIMITS)).not.toThrow();
    expect(HTTP_SERVER_LIMITS.headersTimeout).toBeLessThan(HTTP_SERVER_LIMITS.requestTimeout ?? 0);
  });

  it('looks for expired deadlines often enough for the shortest of them to mean something', () => {
    expect(HTTP_SERVER_LIMITS.connectionsCheckingInterval).toBeLessThanOrEqual(
      (HTTP_SERVER_LIMITS.headersTimeout ?? 0) / 4,
    );
  });
});
