import type { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { replayTicks } from '../../../shared/game/replay.ts';
import type { SubmitScoreRequest } from '../../../shared/leaderboard-contract.ts';
import { REFUSAL_SCENARIOS } from '../../testing/refusals.ts';
import { buildSubmitScoreRequest } from '../../testing/requests.ts';
import { createWorld, expectApiError, listScores, send, sendRaw, startSession, submitScore } from '../../testing/world.ts';
import { logReference } from '../security-log.ts';

const MAX_STRAY_BODY_BYTES = 1024;
const MAX_SCORE_BODY_BYTES = 1024 * 1024;

type LoggedEvent = Record<string, unknown>;

let warn: MockInstance;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
});

function loggedEvents(): LoggedEvent[] {
  return warn.mock.calls.map(([line]) => JSON.parse(line as string) as LoggedEvent);
}

function everythingLogged(): string {
  return warn.mock.calls.map(([line]) => line as string).join('\n');
}

/** What the server sees of a connection that came in through a socket. */
function fromSocket(address: string) {
  return { incoming: { socket: { remoteAddress: address } } };
}

describe('rate limiting', () => {
  it.each([
    ['POST', '/api/sessions', 30],
    ['POST', '/api/scores', 20],
    ['GET', '/api/scores', 120],
    ['GET', '/api/nothing', 120],
  ])('allows %s %s %i times a minute per client and refuses the next', async (method, path, allowed) => {
    const { app } = createWorld();

    for (let request = 1; request <= allowed; request += 1) {
      const response = await send(app, method, path);
      expect(response.status, `request ${request}`).not.toBe(429);
    }

    await expectApiError(await send(app, method, path), 429, 'rate_limited');
  });

  it('does not limit the health check', async () => {
    const { app } = createWorld();

    for (let request = 0; request < 300; request += 1) {
      expect((await send(app, 'GET', '/api/health')).status).toBe(200);
    }
  });

  it('answers with the time to wait and the usual error body, and the security headers still come with it', async () => {
    const { app } = createWorld({ security: { rateLimits: { topScores: 1 } } });
    await send(app, 'GET', '/api/scores');

    const response = await send(app, 'GET', '/api/scores');

    const error = await expectApiError(response, 429, 'rate_limited');
    expect(error.error.message).not.toBe('');
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('permissions-policy')).toContain('camera=()');
  });

  it('counts each route on its own', async () => {
    const { app } = createWorld({ security: { rateLimits: { startSession: 1 } } });
    await send(app, 'POST', '/api/sessions');

    expect((await send(app, 'POST', '/api/sessions')).status).toBe(429);
    expect((await send(app, 'GET', '/api/scores')).status).toBe(200);
    expect((await send(app, 'POST', '/api/scores')).status).toBe(400);
  });

  it('counts each client on its own', async () => {
    const { app } = createWorld({
      security: { rateLimits: { topScores: 1 }, clientAddress: (c) => c.req.header('x-test-client') },
    });
    const as = (client: string) => app.request('/api/scores', { headers: { 'x-test-client': client } });

    expect((await as('a')).status).toBe(200);
    expect((await as('a')).status).toBe(429);
    expect((await as('b')).status).toBe(200);
  });

  it('counts the wait down, and lets the client in again when the window is over', async () => {
    const { app, clock } = createWorld({ security: { rateLimits: { topScores: 1, windowMs: 10_000 } } });
    await send(app, 'GET', '/api/scores');
    expect((await send(app, 'GET', '/api/scores')).headers.get('retry-after')).toBe('10');

    clock.advance(4_000);
    expect((await send(app, 'GET', '/api/scores')).headers.get('retry-after')).toBe('6');

    clock.advance(6_000);
    expect((await send(app, 'GET', '/api/scores')).status).toBe(200);
  });

  it('turns a client away before looking at what it sent', async () => {
    const { app } = createWorld({ security: { rateLimits: { submitScore: 1 } } });
    await send(app, 'POST', '/api/scores', {});

    await expectApiError(await sendRaw(app, 'POST', '/api/scores', 'not json'), 429, 'rate_limited');
    await expectApiError(
      await sendRaw(app, 'POST', '/api/scores', '{}', { 'content-type': 'text/plain' }),
      429,
      'rate_limited',
    );
    await expectApiError(
      await sendRaw(app, 'POST', '/api/scores', 'x'.repeat(MAX_SCORE_BODY_BYTES + 1)),
      429,
      'rate_limited',
    );
  });

  it('leaves the session of a client it turned away as it was', async () => {
    const world = createWorld({ security: { rateLimits: { submitScore: 1 } } });
    const sessionId = await startSession(world.app);
    await send(world.app, 'POST', '/api/scores', {});

    await expectApiError(await submitScore(world, sessionId, 'ABC', 10), 429, 'rate_limited');

    world.clock.advance(60_000);
    expect((await submitScore(world, sessionId, 'ABC', 10)).status).toBe(201);
  });

  describe('when the address of the client is the only thing telling clients apart', () => {
    const listFrom = (app: Hono, address: string, forwardedFor?: string) =>
      app.request(
        '/api/scores',
        { headers: forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor } },
        fromSocket(address),
      );

    it('is not fooled by a forged X-Forwarded-For when no proxy is trusted', async () => {
      const { app } = createWorld({ security: { rateLimits: { topScores: 2 } } });

      expect((await listFrom(app, '198.51.100.1', '1.1.1.1')).status).toBe(200);
      expect((await listFrom(app, '198.51.100.1', '2.2.2.2')).status).toBe(200);
      expect((await listFrom(app, '198.51.100.1', '3.3.3.3')).status).toBe(429);
      expect((await listFrom(app, '198.51.100.1', '203.0.113.99')).status).toBe(429);
      expect((await listFrom(app, '198.51.100.1', 'not even an address')).status).toBe(429);
    });

    it('still gives every real address its own allowance', async () => {
      const { app } = createWorld({ security: { rateLimits: { topScores: 2 } } });
      await listFrom(app, '198.51.100.1');
      await listFrom(app, '198.51.100.1');

      expect((await listFrom(app, '198.51.100.1')).status).toBe(429);
      expect((await listFrom(app, '198.51.100.2')).status).toBe(200);
    });

    it('believes only the entry the trusted proxy added when told there is one', async () => {
      const { app } = createWorld({ security: { rateLimits: { topScores: 1 }, trustProxy: 1 } });

      expect((await listFrom(app, '10.0.0.1', 'forged, 203.0.113.7')).status).toBe(200);
      // The client changes what it wrote, but the proxy still saw the same address.
      expect((await listFrom(app, '10.0.0.1', 'other forgery, 203.0.113.7')).status).toBe(429);
      expect((await listFrom(app, '10.0.0.1', 'forged, 203.0.113.8')).status).toBe(200);
    });

    it('takes the second entry from the right behind two proxies', async () => {
      const { app } = createWorld({ security: { rateLimits: { topScores: 1 }, trustProxy: 2 } });

      expect((await listFrom(app, '10.0.0.1', 'forged, 203.0.113.7, 10.0.0.2')).status).toBe(200);
      expect((await listFrom(app, '10.0.0.1', 'again, 203.0.113.7, 10.0.0.2')).status).toBe(429);
      expect((await listFrom(app, '10.0.0.1', 'forged, 203.0.113.8, 10.0.0.2')).status).toBe(200);
    });

    it('counts a request that bypasses the proxies, and so lacks its entries, against the socket', async () => {
      const { app } = createWorld({ security: { rateLimits: { topScores: 1 }, trustProxy: 2 } });

      expect((await listFrom(app, '198.51.100.1', '203.0.113.7')).status).toBe(200);
      expect((await listFrom(app, '198.51.100.1', '203.0.113.99')).status).toBe(429);
    });
  });
});

describe('the content type of a body', () => {
  /** Posts a perfectly good score; `contentType` is what it claims to be, or nothing at all when it is undefined. */
  async function postScore(contentType: string | undefined) {
    const world = createWorld();
    const sessionId = await startSession(world.app);
    const request = buildSubmitScoreRequest({ sessionId, score: 10, replay: world.verifier.recordRun(10) });
    const text = JSON.stringify(request);
    // A string body would get a content type of its own from the platform, so bytes stand in for "none".
    const bytes = new TextEncoder().encode(text);
    const response = await world.app.request('/api/scores', {
      method: 'POST',
      headers: {
        'content-length': String(bytes.byteLength),
        ...(contentType === undefined ? {} : { 'content-type': contentType }),
      },
      body: contentType === undefined ? bytes : text,
    });
    return { world, sessionId, response };
  }

  it.each([
    'text/plain',
    'text/plain;charset=UTF-8',
    'application/x-www-form-urlencoded',
    'multipart/form-data; boundary=x',
    'application/json-patch+json',
  ])('refuses a score sent as %s, though the text is perfectly good JSON, and keeps nothing', async (type) => {
    const { world, sessionId, response } = await postScore(type);

    await expectApiError(response, 415, 'unsupported_media_type');
    expect(await listScores(world.app)).toEqual([]);
    expect(world.verifier.asked).toEqual([]);
    expect((await submitScore(world, sessionId, 'ABC', 10)).status).toBe(201);
  });

  it('refuses a body that does not say what it is', async () => {
    const { response } = await postScore(undefined);

    await expectApiError(response, 415, 'unsupported_media_type');
  });

  it('refuses a wrong body on the route that starts a session as well', async () => {
    const { app } = createWorld();

    const response = await sendRaw(app, 'POST', '/api/sessions', 'hello', { 'content-type': 'text/plain' });

    await expectApiError(response, 415, 'unsupported_media_type');
  });

  it.each(['application/json', 'application/json; charset=utf-8', 'APPLICATION/JSON'])('takes %s', async (type) => {
    const { response } = await postScore(type);

    expect(response.status).toBe(201);
  });

  it('has nothing against a request that has no body', async () => {
    const { app } = createWorld();

    expect((await app.request('/api/sessions', { method: 'POST' })).status).toBe(201);
    await expectApiError(await app.request('/api/scores', { method: 'POST' }), 400, 'invalid_request');
  });

  it('leaves a route that does not exist to answer that it does not', async () => {
    const { app } = createWorld();

    const response = await sendRaw(app, 'POST', '/api/nope', 'hello', { 'content-type': 'text/plain' });

    await expectApiError(response, 404, 'invalid_request');
  });

  it('is judged after the rate limit and before the size', async () => {
    const { app } = createWorld();

    const response = await sendRaw(app, 'POST', '/api/scores', 'x'.repeat(MAX_SCORE_BODY_BYTES + 1), {
      'content-type': 'text/plain',
    });

    await expectApiError(response, 415, 'unsupported_media_type');
  });
});

describe('the size of a body', () => {
  function padded(body: unknown, bytes: number): string {
    return JSON.stringify(body).padEnd(bytes, ' ');
  }

  async function chunked(app: Hono, path: string, body: string) {
    return await app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' },
      body,
    });
  }

  it('lets a score be as large as 1 MiB, to hold the longest replay', async () => {
    const world = createWorld();
    const sessionId = await startSession(world.app);
    const request = buildSubmitScoreRequest({ sessionId, score: 10, replay: world.verifier.recordRun(10) });

    const response = await sendRaw(world.app, 'POST', '/api/scores', padded(request, MAX_SCORE_BODY_BYTES));

    expect(response.status).toBe(201);
  });

  it('refuses a score one byte over that with 413, announced or not', async () => {
    const { app } = createWorld();
    const oversized = padded(buildSubmitScoreRequest(), MAX_SCORE_BODY_BYTES + 1);

    await expectApiError(await sendRaw(app, 'POST', '/api/scores', oversized), 413, 'payload_too_large');
    await expectApiError(await chunked(app, '/api/scores', oversized), 413, 'payload_too_large');
  });

  it('keeps the route that starts a session to 1 KiB, as it has nothing to read', async () => {
    const { app } = createWorld();

    expect((await sendRaw(app, 'POST', '/api/sessions', padded({}, MAX_STRAY_BODY_BYTES))).status).toBe(201);
    await expectApiError(
      await sendRaw(app, 'POST', '/api/sessions', padded({}, MAX_STRAY_BODY_BYTES + 1)),
      413,
      'payload_too_large',
    );
    await expectApiError(
      await chunked(app, '/api/sessions', padded({}, MAX_STRAY_BODY_BYTES + 1)),
      413,
      'payload_too_large',
    );
  });

  it('keeps a route that does not exist to 1 KiB as well, whatever the method', async () => {
    const { app } = createWorld();

    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      await expectApiError(await sendRaw(app, method, '/api/nope', padded({}, MAX_STRAY_BODY_BYTES)), 404, 'invalid_request');
      await expectApiError(
        await sendRaw(app, method, '/api/nope', padded({}, MAX_STRAY_BODY_BYTES + 1)),
        413,
        'payload_too_large',
      );
    }
  });

  it('refuses by size before reading what the body says', async () => {
    const { app } = createWorld();

    await expectApiError(
      await sendRaw(app, 'POST', '/api/scores', `{ not json ${' '.repeat(MAX_SCORE_BODY_BYTES)}`),
      413,
      'payload_too_large',
    );
  });
});

describe('the security log', () => {
  it('says nothing about requests that were in order', async () => {
    const world = createWorld();

    await send(world.app, 'GET', '/api/health');
    await send(world.app, 'GET', '/api/scores');
    await submitScore(world, await startSession(world.app), 'ABC', 10);

    expect(warn).not.toHaveBeenCalled();
  });

  describe('about the rate limit', () => {
    it('records the first refusal of a window, with the route and how long to wait', async () => {
      const { app } = createWorld({ security: { rateLimits: { topScores: 1 } } });
      await send(app, 'GET', '/api/scores');

      for (let refused = 0; refused < 5; refused += 1) {
        await send(app, 'GET', '/api/scores');
      }

      expect(loggedEvents()).toEqual([
        {
          time: expect.any(String),
          event: 'rate_limited',
          code: 'rate_limited',
          route: 'GET /api/scores',
          retryAfter: 60,
        },
      ]);
    });

    it('records it again in the next window', async () => {
      const { app, clock } = createWorld({ security: { rateLimits: { topScores: 1 } } });
      await send(app, 'GET', '/api/scores');
      await send(app, 'GET', '/api/scores');

      clock.advance(60_000);
      await send(app, 'GET', '/api/scores');
      await send(app, 'GET', '/api/scores');

      expect(loggedEvents().map((event) => event.event)).toEqual(['rate_limited', 'rate_limited']);
    });
  });

  describe('about a body of the wrong type', () => {
    it('records the route and the type, cut short', async () => {
      const { app } = createWorld();

      await sendRaw(app, 'POST', '/api/scores', '{}', { 'content-type': `text/plain; ${'x'.repeat(500)}` });
      await app.request('/api/sessions', {
        method: 'POST',
        headers: { 'content-length': '2' },
        body: new TextEncoder().encode('{}'),
      });

      const [first, second] = loggedEvents();
      expect(first).toMatchObject({ event: 'unsupported_media_type', code: 'unsupported_media_type', route: 'POST /api/scores' });
      expect(String(first?.contentType)).toHaveLength(100);
      expect(second).toMatchObject({
        event: 'unsupported_media_type',
        code: 'unsupported_media_type',
        route: 'POST /api/sessions',
        contentType: 'missing',
      });
    });
  });

  describe('about a body that is too large', () => {
    it('records the route and the limit', async () => {
      const { app } = createWorld();

      await sendRaw(app, 'POST', '/api/scores', 'x'.repeat(MAX_SCORE_BODY_BYTES + 1));

      expect(loggedEvents()).toEqual([
        {
          time: expect.any(String),
          event: 'payload_too_large',
          code: 'payload_too_large',
          route: 'POST /api/scores',
          limitBytes: MAX_SCORE_BODY_BYTES,
        },
      ]);
    });

    it('names a route that does not exist by its pattern, never by the path that was asked for', async () => {
      const { app } = createWorld();
      const hostile = `/api/${'x'.repeat(2000)}\n{"event":"forged"}`;

      await sendRaw(app, 'POST', encodeURI(hostile), 'x'.repeat(MAX_STRAY_BODY_BYTES + 1));

      const [event] = loggedEvents();
      expect(event).toMatchObject({ event: 'payload_too_large', route: 'POST /api/*', limitBytes: MAX_STRAY_BODY_BYTES });
      expect(everythingLogged()).not.toContain('xxxxxxxxxx');
    });
  });

  describe.each(REFUSAL_SCENARIOS)('about $name', (scenario) => {
    it(`records one ${scenario.code} refusal, and which session and how long a run it was`, async () => {
      const world = createWorld();

      const { request } = await scenario.attempt(world);

      const events = loggedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ event: 'submission_refused', code: scenario.code });
      if (scenario.isSubmission) {
        const { sessionId, replay } = request as SubmitScoreRequest;
        expect(events[0]).toMatchObject({ session: logReference(sessionId), ticks: replayTicks(replay) });
      } else {
        expect(events[0]).not.toHaveProperty('session');
        expect(events[0]).not.toHaveProperty('ticks');
      }
    });

    it('writes neither the session id, nor the initials, nor the recording, nor who sent it', async () => {
      const world = createWorld({ security: { clientAddress: () => '203.0.113.7' } });

      const { request } = await scenario.attempt(world);

      const written = everythingLogged();
      const { sessionId, initials, replay } = request as Partial<SubmitScoreRequest>;
      if (sessionId !== undefined) expect(written).not.toContain(sessionId);
      if (initials !== undefined) expect(written).not.toContain(initials);
      if (replay !== undefined) expect(written).not.toContain(JSON.stringify(replay));
      expect(written).not.toContain('203.0.113.7');
    });
  });

  it('says why a recording was refused, in the log only', async () => {
    const world = createWorld();
    const sessionId = await startSession(world.app);
    const replay = world.verifier.recordFailure('continued_after_game_over');

    const response = await send(world.app, 'POST', '/api/scores', buildSubmitScoreRequest({ sessionId, replay }));

    expect(loggedEvents()[0]).toMatchObject({ code: 'invalid_replay', reason: 'continued_after_game_over' });
    expect(JSON.stringify(await response.json())).not.toContain('continued_after_game_over');
  });

  describe('about who the client is', () => {
    async function provokeOneOfEach(security: { logClientAddress?: boolean }) {
      const world = createWorld({
        security: { rateLimits: { topScores: 1 }, clientAddress: () => '203.0.113.7', ...security },
      });
      await send(world.app, 'GET', '/api/scores');
      await send(world.app, 'GET', '/api/scores');
      await sendRaw(world.app, 'POST', '/api/scores', '{}', { 'content-type': 'text/plain' });
      await send(world.app, 'POST', '/api/scores', { nonsense: true });
      return loggedEvents();
    }

    it('is left out of the log unless asked for', async () => {
      const events = await provokeOneOfEach({});

      expect(events).toHaveLength(3);
      for (const event of events) {
        expect(event).not.toHaveProperty('client');
      }
      expect(everythingLogged()).not.toContain('203.0.113.7');
    });

    it('is on every line when asked for', async () => {
      const events = await provokeOneOfEach({ logClientAddress: true });

      expect(events.map((event) => event.client)).toEqual(['203.0.113.7', '203.0.113.7', '203.0.113.7']);
    });

    it('is called unknown when there is no telling', async () => {
      const world = createWorld({ security: { rateLimits: { topScores: 1 }, logClientAddress: true } });
      await send(world.app, 'GET', '/api/scores');
      await send(world.app, 'GET', '/api/scores');

      expect(loggedEvents()[0]).toMatchObject({ client: 'unknown' });
    });
  });
});
