import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { MAX_DISPLAYED_SCORE } from '../../../shared/game/constants.ts';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../shared/leaderboard-contract.ts';
import { LeaderboardService } from '../../application/leaderboard-service.ts';
import type { LeaderboardStore } from '../../application/ports.ts';
import { FakeRunVerifier, ManualClock, SequentialIdGenerator } from '../../testing/fakes.ts';
import { buildSubmitScoreRequest } from '../../testing/requests.ts';
import {
  createWorld,
  expectApiError,
  listScores,
  recordScore,
  send,
  sendRaw,
  startSession,
  submitScore,
} from '../../testing/world.ts';
import { createApp } from './create-app.ts';

const SECRET = 'secret that lives outside the static directory';

describe('GET /api/health', () => {
  it('reports that the service is up, uncached', async () => {
    const { app } = createWorld();

    const response = await send(app, 'GET', '/api/health');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('says which commit it was built from when the build tells it, so that a deploy can prove what runs', async () => {
    const { app } = createWorld({ revision: '9052bb9a1c3e4d5f60718293a4b5c6d7e8f90123' });

    const response = await send(app, 'GET', '/api/health');

    expect(await response.json()).toEqual({ status: 'ok', revision: '9052bb9a1c3e4d5f60718293a4b5c6d7e8f90123' });
  });
});

describe('POST /api/sessions', () => {
  it('creates a session and answers 201 with its id, uncached', async () => {
    const { app } = createWorld();

    const response = await send(app, 'POST', '/api/sessions');

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ sessionId: 'session-1' });
  });

  it('issues a different id every time', async () => {
    const { app } = createWorld();

    expect([await startSession(app), await startSession(app)]).toEqual(['session-1', 'session-2']);
  });

  it('needs neither a body nor a content type, which is how the web client asks for one', async () => {
    const { app } = createWorld();

    const response = await app.request('/api/sessions', { method: 'POST' });

    expect(response.status).toBe(201);
  });
});

describe('POST /api/scores', () => {
  it('records the score and answers 201 with the ranked entry, uncached', async () => {
    const world = createWorld();
    const sessionId = await startSession(world.app);
    world.clock.advance(10_000);

    const response = await submitScore(world, sessionId, 'ABC', 2_500);

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      entry: { rank: 1, initials: 'ABC', score: 2_500, achievedAt: new Date(world.clock.now()).toISOString() },
    });
  });

  it('ranks the entry against the scores already on the board', async () => {
    const world = createWorld();
    await recordScore(world, 'AAA', 300);

    expect((await recordScore(world, 'BBB', 500)).rank).toBe(1);
    expect((await recordScore(world, 'CCC', 100)).rank).toBe(3);
  });

  it('ignores properties it does not know', async () => {
    const world = createWorld();
    const sessionId = await startSession(world.app);
    const replay = world.verifier.recordRun(10);

    const request = { ...buildSubmitScoreRequest({ sessionId, score: 10, replay }), admin: true };

    const response = await send(world.app, 'POST', '/api/scores', request);

    expect(response.status).toBe(201);
  });

  describe('answers 400 invalid_request for', () => {
    const valid = buildSubmitScoreRequest();

    it.each<[string, string]>([
      ['malformed JSON', '{"sessionId": "session-1", '],
      ['an empty body', ''],
      ['plain text', 'ABC 100'],
      ['a JSON array', JSON.stringify([valid])],
      ['JSON null', 'null'],
      ['a JSON string', JSON.stringify('ABC')],
      ['a JSON number', '42'],
    ])('%s', async (_name, rawBody) => {
      const { app } = createWorld();
      await startSession(app);

      await expectApiError(await sendRaw(app, 'POST', '/api/scores', rawBody), 400, 'invalid_request');
    });

    it.each<[string, Record<string, unknown>]>([
      ['a missing sessionId', { ...valid, sessionId: undefined }],
      ['an empty sessionId', { ...valid, sessionId: '' }],
      ['a sessionId that is not a string', { ...valid, sessionId: 1 }],
      ['a sessionId that is far too long', { ...valid, sessionId: 'x'.repeat(500) }],
      ['missing initials', { ...valid, initials: undefined }],
      ['lowercase initials', { ...valid, initials: 'abc' }],
      ['initials that are too short', { ...valid, initials: 'AB' }],
      ['initials that are too long', { ...valid, initials: 'ABCD' }],
      ['initials with a symbol', { ...valid, initials: 'A-B' }],
      ['a missing score', { ...valid, score: undefined }],
      ['a zero score', { ...valid, score: 0 }],
      ['a negative score', { ...valid, score: -1 }],
      ['a fractional score', { ...valid, score: 1.5 }],
      ['a score above the maximum', { ...valid, score: MAX_DISPLAYED_SCORE + 1 }],
      ['a score sent as a string', { ...valid, score: '100' }],
      ['a missing engineVersion', { ...valid, engineVersion: undefined }],
      ['an engineVersion sent as a string', { ...valid, engineVersion: '1' }],
      ['a missing replay', { ...valid, replay: undefined }],
      ['an empty replay', { ...valid, replay: [] }],
      ['a replay with an odd number of elements', { ...valid, replay: [1, 1, 2] }],
      ['a replay with a control no button makes', { ...valid, replay: [99, 1] }],
      ['a replay that holds the controls for no time', { ...valid, replay: [1, 0] }],
      ['a replay that does not merge neighbouring runs', { ...valid, replay: [1, 1, 1, 1] }],
    ])('%s', async (_name, body) => {
      const { app } = createWorld();
      await startSession(app);

      const response = await send(app, 'POST', '/api/scores', body);

      const error = await expectApiError(response, 400, 'invalid_request');
      expect(error.error.message).toMatch(/sessionId|initials|score|engineVersion|replay/);
    });

    it('without repeating the replay or the values that were wrong', async () => {
      const { app } = createWorld();
      const sessionId = await startSession(app);
      const body = buildSubmitScoreRequest({ sessionId, replay: [77, 4242] });

      const response = await send(app, 'POST', '/api/scores', body);

      const text = JSON.stringify(await response.json());
      expect(text).not.toContain('77');
      expect(text).not.toContain('4242');
    });

    it('and leaves the session usable afterwards', async () => {
      const world = createWorld();
      const sessionId = await startSession(world.app);

      await sendRaw(world.app, 'POST', '/api/scores', 'not json');
      await submitScore(world, sessionId, 'abc', 100);

      expect((await submitScore(world, sessionId, 'ABC', 100)).status).toBe(201);
    });
  });

  it('answers 404 unknown_session for a session that was never issued', async () => {
    const world = createWorld();

    await expectApiError(await submitScore(world, 'never-issued', 'ABC', 100), 404, 'unknown_session');
    expect(await listScores(world.app)).toEqual([]);
  });

  it('answers 409 session_already_used when a session submits twice', async () => {
    const world = createWorld();
    const sessionId = await startSession(world.app);
    await submitScore(world, sessionId, 'AAA', 500);

    await expectApiError(await submitScore(world, sessionId, 'BBB', 900), 409, 'session_already_used');
    await expectApiError(await submitScore(world, sessionId, 'AAA', 500), 409, 'session_already_used');
    expect(await listScores(world.app)).toHaveLength(1);
  });
});

describe('GET /api/scores', () => {
  it('answers 200 with an empty list before anyone has scored, uncached', async () => {
    const { app } = createWorld();

    const response = await send(app, 'GET', '/api/scores');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ entries: [] });
  });

  it('orders by score, then earliest achievement, then insertion order, with ranks 1..N', async () => {
    const world = createWorld();
    await recordScore(world, 'AAA', 300);
    world.clock.advance(1_000);
    await recordScore(world, 'BBB', 500);
    await recordScore(world, 'CCC', 500);
    await recordScore(world, 'DDD', 300);
    world.clock.advance(1_000);
    await recordScore(world, 'EEE', 900);

    const entries = await listScores(world.app);

    expect(entries.map(({ rank, initials, score }) => ({ rank, initials, score }))).toEqual([
      { rank: 1, initials: 'EEE', score: 900 },
      { rank: 2, initials: 'BBB', score: 500 },
      { rank: 3, initials: 'CCC', score: 500 },
      { rank: 4, initials: 'AAA', score: 300 },
      { rank: 5, initials: 'DDD', score: 300 },
    ]);
  });

  it('formats achievedAt as an ISO-8601 timestamp', async () => {
    const world = createWorld();
    await recordScore(world, 'AAA', 300);

    const [entry] = await listScores(world.app);

    expect(entry?.achievedAt).toBe(new Date(world.clock.now()).toISOString());
  });

  it('never shows anything but rank, initials, score and time', async () => {
    const world = createWorld();
    await recordScore(world, 'AAA', 300);

    const [entry] = await listScores(world.app);

    expect(Object.keys(entry ?? {}).sort()).toEqual(['achievedAt', 'initials', 'rank', 'score']);
  });

  it('returns the default page size when no limit is given', async () => {
    const world = createWorld();
    for (let index = 0; index < DEFAULT_PAGE_SIZE + 2; index += 1) {
      await recordScore(world, 'AAA', 100 + index);
    }

    expect(await listScores(world.app)).toHaveLength(DEFAULT_PAGE_SIZE);
  });

  it('honours the limit, up to the maximum page size', async () => {
    const world = createWorld();
    for (let index = 0; index < 5; index += 1) {
      await recordScore(world, 'AAA', 100 + index);
    }

    expect(await listScores(world.app, '?limit=3')).toHaveLength(3);
    expect(await listScores(world.app, '?limit=1')).toHaveLength(1);
    expect(await listScores(world.app, `?limit=${MAX_PAGE_SIZE}`)).toHaveLength(5);
  });

  it.each([
    ['zero', '0'],
    ['above the maximum', String(MAX_PAGE_SIZE + 1)],
    ['negative', '-1'],
    ['fractional', '1.5'],
    ['empty', ''],
    ['not a number', 'abc'],
    ['a number followed by text', '10abc'],
    ['hexadecimal', '0x10'],
    ['exponential', '1e1'],
  ])('answers 400 invalid_request for a limit that is %s', async (_name, limit) => {
    const { app } = createWorld();

    await expectApiError(await send(app, 'GET', `/api/scores?limit=${encodeURIComponent(limit)}`), 400, 'invalid_request');
  });
});

describe('unknown API routes', () => {
  let siteDir: string;

  beforeAll(() => {
    siteDir = mkdtempSync(join(tmpdir(), 'space-invaders-site-'));
    writeFileSync(join(siteDir, 'index.html'), '<!doctype html><title>shell</title>');
  });

  afterAll(() => {
    rmSync(siteDir, { recursive: true, force: true });
  });

  describe.each([
    ['without static hosting', false],
    ['with static hosting, which must not swallow them', true],
  ])('%s', (_name, hosted) => {
    const appFor = () => createWorld(hosted ? { staticDir: siteDir } : {}).app;

    it.each([
      ['GET', '/api/nope'],
      ['GET', '/api'],
      ['GET', '/api/'],
      ['POST', '/api/nope'],
      ['GET', '/api/scores/'],
      ['GET', '/api/sessions'],
      ['DELETE', '/api/scores'],
      ['GET', '/api/health/deeper'],
      // The router's wildcard stops at a line break, so these used to match nothing and get a bare 404.
      ['GET', '/api/%0Anope'],
      ['GET', '/api/nope%0D%0Aset-cookie:x'],
      ['POST', '/api/%0A'],
    ])('answers %s %s with a JSON 404', async (method, path) => {
      await expectApiError(await send(appFor(), method, path), 404, 'invalid_request');
    });
  });
});

describe('unexpected failures', () => {
  const cause = 'disk exploded at /var/secret/leaderboard.sqlite';
  const fail = (): never => {
    throw new Error(cause);
  };
  const brokenStore: LeaderboardStore = {
    saveSession: fail,
    findSession: fail,
    isSessionUsed: fail,
    deleteUnusedSessionsStartedBefore: fail,
    addScore: fail,
    topScores: fail,
  };
  const brokenApp = createApp({
    service: new LeaderboardService({
      store: brokenStore,
      clock: new ManualClock(),
      ids: new SequentialIdGenerator(),
      verifier: new FakeRunVerifier(),
    }),
  });
  let consoleError: MockInstance;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it.each([
    ['POST', '/api/sessions', undefined],
    ['POST', '/api/scores', buildSubmitScoreRequest()],
    ['GET', '/api/scores', undefined],
  ])('answers %s %s with a generic 500 and logs the cause', async (method, path, body) => {
    const response = await send(brokenApp, method, path, body);

    const error = await expectApiError(response, 500, 'internal_error');
    expect(error.error.message).toBe('Internal server error.');
    expect(JSON.stringify(error)).not.toContain('disk exploded');
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: cause }));
  });
});

describe('static hosting', () => {
  let workspace: string;
  let siteDir: string;

  beforeAll(() => {
    workspace = mkdtempSync(join(tmpdir(), 'space-invaders-static-'));
    siteDir = join(workspace, 'site');
    mkdirSync(join(siteDir, 'assets'), { recursive: true });
    writeFileSync(join(siteDir, 'index.html'), '<!doctype html><title>Space Invaders shell</title>');
    writeFileSync(join(siteDir, 'assets', 'app.js'), 'console.log("space invaders");');
    writeFileSync(join(workspace, 'secret.txt'), SECRET);
  });

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it.each([
    ['an absolute path', () => siteDir],
    ['a path relative to the working directory', () => relative(process.cwd(), siteDir)],
  ])('serves the files of the directory given as %s', async (_name, staticDir) => {
    const { app } = createWorld({ staticDir: staticDir() });

    const response = await app.request('/assets/app.js');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(await response.text()).toBe('console.log("space invaders");');
  });

  it('can host the working directory itself', async () => {
    const { app } = createWorld({ staticDir: process.cwd() });

    const response = await app.request('/package.json');

    expect(response.status).toBe(200);
    expect(JSON.parse(await response.text())).toHaveProperty('name');
  });

  it.each(['/', '/index.html'])('serves the shell at %s', async (path) => {
    const { app } = createWorld({ staticDir: siteDir });

    const response = await app.request(path);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('Space Invaders shell');
  });

  it.each(['/play', '/scores/weekly', '/apiary', '/api-docs'])(
    'falls back to the shell for the client-side route %s',
    async (path) => {
      const { app } = createWorld({ staticDir: siteDir });

      const response = await app.request(path);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(await response.text()).toContain('Space Invaders shell');
    },
  );

  it.each(['/assets/missing.js', '/missing.css', '/deep/missing.png'])(
    'answers 404, not the shell, for the missing file %s',
    async (path) => {
      const { app } = createWorld({ staticDir: siteDir });

      const response = await app.request(path);

      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('Space Invaders shell');
    },
  );

  describe('tells browsers what they may keep', () => {
    it('lets them keep a fingerprinted asset that was really served for ever', async () => {
      const { app } = createWorld({ staticDir: siteDir });

      const asset = await app.request('/assets/app.js');

      expect(asset.status).toBe(200);
      expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    });

    it.each(['/', '/index.html', '/play'])('makes them check the shell again every time (%s)', async (path) => {
      const { app } = createWorld({ staticDir: siteDir });

      const shell = await app.request(path);

      expect(shell.headers.get('cache-control')).toBe('no-cache');
    });

    // These are answered with the shell, which must not be pinned for ever to a URL that may hold a file one day.
    it.each(['/assets/', '/assets/nothing', '/assets/nothing/deeper', '/assets/%E0%A4%A'])(
      'does not let them keep the shell that stands in for %s',
      async (path) => {
        const { app } = createWorld({ staticDir: siteDir });

        const response = await app.request(path);

        expect(response.status).toBe(200);
        expect(await response.text()).toContain('Space Invaders shell');
        expect(response.headers.get('cache-control')).toBe('no-cache');
      },
    );

    it('says nothing about what is not there', async () => {
      const { app } = createWorld({ staticDir: siteDir });

      const response = await app.request('/assets/missing.js');

      expect(response.headers.get('cache-control') ?? '').not.toContain('immutable');
    });
  });

  it('answers HEAD requests without a body', async () => {
    const { app } = createWorld({ staticDir: siteDir });

    const response = await app.request('/', { method: 'HEAD' });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('only serves files for GET and HEAD', async () => {
    const { app } = createWorld({ staticDir: siteDir });

    expect((await app.request('/', { method: 'POST' })).status).toBe(404);
    expect((await app.request('/assets/app.js', { method: 'DELETE' })).status).toBe(404);
  });

  it.each([
    '/secret.txt',
    '/../secret.txt',
    '/%2e%2e/secret.txt',
    '/%2e%2e%2fsecret.txt',
    '/..%2fsecret.txt',
    '/assets/..%2f..%2fsecret.txt',
    '/assets/%2e%2e/%2e%2e/secret.txt',
  ])('never serves files from outside the static directory (%s)', async (path) => {
    const { app } = createWorld({ staticDir: siteDir });

    const response = await app.request(path);

    expect(await response.text()).not.toContain(SECRET);
  });

  it('keeps the API working alongside the site', async () => {
    const world = createWorld({ staticDir: siteDir });

    expect(await (await world.app.request('/api/health')).json()).toEqual({ status: 'ok' });
    expect(await recordScore(world, 'ABC', 100)).toMatchObject({ rank: 1, initials: 'ABC' });
  });

  it('answers 404 for everything when no directory is given', async () => {
    const { app } = createWorld();

    expect((await app.request('/')).status).toBe(404);
    expect((await app.request('/assets/app.js')).status).toBe(404);
  });
});

describe('security headers', () => {
  let siteDir: string;

  beforeAll(() => {
    siteDir = mkdtempSync(join(tmpdir(), 'space-invaders-headers-'));
    writeFileSync(join(siteDir, 'index.html'), '<!doctype html><title>shell</title>');
    writeFileSync(join(siteDir, 'app.js'), '');
  });

  afterAll(() => {
    rmSync(siteDir, { recursive: true, force: true });
  });

  it.each(['/', '/app.js', '/api/health', '/missing.css', '/api/nope', '/api/%0Anope', '/%0Anope', '/nope%0A'])(
    'are sent with %s',
    async (path) => {
      const { app } = createWorld({ staticDir: siteDir });

      const { headers } = await app.request(path);

      expect(headers.get('x-content-type-options')).toBe('nosniff');
      expect(headers.get('x-frame-options')).toBe('DENY');
      expect(headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(headers.get('content-security-policy')).toContain("script-src 'self'");
      expect(headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    },
  );

  describe('content security policy', () => {
    async function policyOf(path: string): Promise<Map<string, string[]>> {
      const { app } = createWorld({ staticDir: siteDir });
      const header = (await app.request(path)).headers.get('content-security-policy') ?? '';
      return new Map(
        header.split(';').map((directive) => {
          const [name = '', ...sources] = directive.trim().split(/\s+/);
          return [name, sources];
        }),
      );
    }

    it.each(['/', '/api/health', '/missing.css'])('lets the page load and report to Google Analytics, and no other foreign host (%s)', async (path) => {
      const policy = await policyOf(path);

      expect(policy.get('script-src')).toEqual(["'self'", 'https://www.googletagmanager.com']);
      expect(policy.get('connect-src')).toEqual([
        "'self'",
        'https://www.googletagmanager.com',
        'https://*.google-analytics.com',
        'https://*.google.com',
      ]);
      expect(policy.get('img-src')).toEqual(["'self'", 'https://www.googletagmanager.com', 'https://*.google-analytics.com']);
      expect(policy.get('default-src')).toEqual(["'none'"]);
      expect(policy.get('style-src')).toEqual(["'self'"]);
    });

    it('never allows inline or evaluated script', async () => {
      const policy = await policyOf('/');

      for (const [directive, sources] of policy) {
        expect(sources, directive).not.toContain("'unsafe-inline'");
        expect(sources, directive).not.toContain("'unsafe-eval'");
      }
    });
  });

  it.each(['/', '/api/health', '/missing.css', '/nope%0A'])('make the browser stay on HTTPS for a year (%s)', async (path) => {
    const { app } = createWorld({ staticDir: siteDir });

    const { headers } = await app.request(path);

    expect(headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
  });

  it.each(['/', '/api/health', '/missing.css'])('deny the browser features a game has no use for (%s)', async (path) => {
    const { app } = createWorld({ staticDir: siteDir });

    const policy = (await app.request(path)).headers.get('permissions-policy') ?? '';

    for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb', 'bluetooth', 'serial', 'hid', 'midi']) {
      expect(policy, feature).toContain(`${feature}=()`);
    }
  });

  it('leave alone the features a game may want', async () => {
    const { app } = createWorld({ staticDir: siteDir });

    const policy = (await app.request('/')).headers.get('permissions-policy') ?? '';

    for (const feature of ['gamepad', 'fullscreen', 'autoplay', 'screen-wake-lock']) {
      expect(policy, feature).not.toContain(feature);
    }
  });
});
