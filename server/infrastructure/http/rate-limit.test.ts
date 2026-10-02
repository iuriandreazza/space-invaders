import { Hono, type Context } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { ApiErrorResponse } from '../../../shared/leaderboard-contract.ts';
import { ManualClock } from '../../testing/fakes.ts';
import { FixedWindowCounter, rateLimit } from './rate-limit.ts';

const WINDOW_MS = 60_000;

function counterWith(limit: number) {
  const clock = new ManualClock();
  return { clock, counter: new FixedWindowCounter({ limit, windowMs: WINDOW_MS, clock }) };
}

describe('FixedWindowCounter', () => {
  it('lets a client make as many requests as the limit in a window and refuses the rest', () => {
    const { counter } = counterWith(3);

    const verdicts = Array.from({ length: 6 }, () => counter.hit('a'));

    expect(verdicts.map((verdict) => verdict.limited)).toEqual([false, false, false, true, true, true]);
  });

  it('points out the first refusal of a window, and only that one', () => {
    const { counter } = counterWith(3);

    const verdicts = Array.from({ length: 6 }, () => counter.hit('a'));

    expect(verdicts.map((verdict) => verdict.firstRefusal)).toEqual([false, false, false, true, false, false]);
  });

  it('counts every client on its own', () => {
    const { counter } = counterWith(1);
    counter.hit('a');

    expect(counter.hit('a').limited).toBe(true);
    expect(counter.hit('b').limited).toBe(false);
  });

  it('starts a new window the moment the old one ends, not a millisecond before', () => {
    const { counter, clock } = counterWith(1);
    counter.hit('a');

    clock.advance(WINDOW_MS - 1);
    expect(counter.hit('a').limited).toBe(true);

    clock.advance(1);
    expect(counter.hit('a').limited).toBe(false);
  });

  it('points out the first refusal again in the next window', () => {
    const { counter, clock } = counterWith(1);
    counter.hit('a');
    expect(counter.hit('a').firstRefusal).toBe(true);
    expect(counter.hit('a').firstRefusal).toBe(false);

    clock.advance(WINDOW_MS);
    counter.hit('a');

    expect(counter.hit('a').firstRefusal).toBe(true);
  });

  it('says how long to wait, in whole seconds and never fewer than one', () => {
    const { counter, clock } = counterWith(1);

    expect(counter.hit('a').retryAfterSeconds).toBe(60);
    clock.advance(10_000);
    expect(counter.hit('a').retryAfterSeconds).toBe(50);
    clock.advance(49_500);
    expect(counter.hit('a').retryAfterSeconds).toBe(1);
    clock.advance(499);
    expect(counter.hit('a').retryAfterSeconds).toBe(1);
  });

  it('is not fooled by a clock that stands still or goes back', () => {
    const { counter, clock } = counterWith(2);
    counter.hit('a');
    clock.advance(-30_000);

    expect(counter.hit('a').limited).toBe(false);
    expect(counter.hit('a').limited).toBe(true);
  });

  describe('keeping its memory bounded', () => {
    it('sweeps the windows that have ended once more than 10,000 clients are tracked', () => {
      const { counter, clock } = counterWith(5);
      for (let client = 0; client < 10_000; client += 1) {
        counter.hit(`client-${client}`);
      }
      expect(counter.trackedClients).toBe(10_000);

      clock.advance(WINDOW_MS);
      counter.hit('newcomer');

      expect(counter.trackedClients).toBe(1);
    });

    it('sweeps only the windows that have ended', () => {
      const { counter, clock } = counterWith(5);
      for (let client = 0; client < 10_000; client += 1) {
        counter.hit(`early-${client}`);
      }
      clock.advance(30_000);
      for (let client = 0; client < 5_000; client += 1) {
        counter.hit(`late-${client}`);
      }

      clock.advance(36_000);
      counter.hit('newcomer');

      expect(counter.trackedClients).toBe(5_001);
    });

    it('does not sweep before that many clients are tracked', () => {
      const { counter, clock } = counterWith(5);
      for (let client = 0; client < 100; client += 1) {
        counter.hit(`client-${client}`);
      }

      clock.advance(WINDOW_MS);
      counter.hit('newcomer');

      expect(counter.trackedClients).toBe(101);
    });

    it('never tracks more than 100,000 clients, dropping the oldest first', () => {
      const { counter } = counterWith(1);
      counter.hit('first');
      expect(counter.hit('first').limited).toBe(true);
      for (let client = 0; client < 99_999; client += 1) {
        counter.hit(`client-${client}`);
      }
      expect(counter.trackedClients).toBe(100_000);

      counter.hit('one-too-many');

      expect(counter.trackedClients).toBe(100_000);
      // The oldest window was the one dropped, so that client starts afresh.
      expect(counter.hit('first').limited).toBe(false);
      expect(counter.trackedClients).toBe(100_000);
    });
  });
});

describe('rateLimit', () => {
  function appLimitedTo(limit: number, clientAddress: (c: Context) => string | undefined = () => 'client') {
    const clock = new ManualClock();
    const onLimited = vi.fn();
    const handler = vi.fn((c: Context) => c.text('served'));
    const app = new Hono();
    app.get('/limited', rateLimit({ limit, windowMs: WINDOW_MS, clock, clientAddress, onLimited }), handler);
    return { app, clock, onLimited, handler };
  }

  it('serves the requests within the limit', async () => {
    const { app, handler } = appLimitedTo(2);

    expect((await app.request('/limited')).status).toBe(200);
    expect((await app.request('/limited')).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('answers 429 with the error body and the time to wait, and never reaches the handler', async () => {
    const { app, handler } = appLimitedTo(1);
    await app.request('/limited');

    const response = await app.request('/limited');

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = (await response.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('rate_limited');
    expect(body.error.message).not.toBe('');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('counts the wait down as the window runs out, and serves again when it is over', async () => {
    const { app, clock } = appLimitedTo(1);
    await app.request('/limited');
    clock.advance(20_000);

    expect((await app.request('/limited')).headers.get('retry-after')).toBe('40');

    clock.advance(40_000);
    expect((await app.request('/limited')).status).toBe(200);
  });

  it('reports only the first refusal of a window, with the time to wait', async () => {
    const { app, onLimited } = appLimitedTo(1);
    await app.request('/limited');

    for (let refused = 0; refused < 5; refused += 1) {
      await app.request('/limited');
    }

    expect(onLimited).toHaveBeenCalledTimes(1);
    expect(onLimited).toHaveBeenCalledWith(expect.anything(), 60);
  });

  it('tells clients apart by the address it is given', async () => {
    const { app } = appLimitedTo(1, (c) => c.req.header('x-test-client'));
    const as = (client: string) => app.request('/limited', { headers: { 'x-test-client': client } });
    await as('a');

    expect((await as('a')).status).toBe(429);
    expect((await as('b')).status).toBe(200);
  });

  it('counts the addresses of one IPv6 network as one client, and other networks apart', async () => {
    const { app } = appLimitedTo(1, (c) => c.req.header('x-test-client'));
    const as = (client: string) => app.request('/limited', { headers: { 'x-test-client': client } });
    await as('2001:db8:1:2:aaaa::1');

    expect((await as('2001:db8:1:2:bbbb:cccc:dddd:eeee')).status).toBe(429);
    expect((await as('2001:db8:1:3::1')).status).toBe(200);
  });

  it('counts an IPv4 client of a dual-stack socket by its IPv4 address', async () => {
    const { app } = appLimitedTo(1, (c) => c.req.header('x-test-client'));
    const as = (client: string) => app.request('/limited', { headers: { 'x-test-client': client } });
    await as('::ffff:203.0.113.5');

    expect((await as('203.0.113.5')).status).toBe(429);
    expect((await as('::ffff:203.0.113.6')).status).toBe(200);
  });

  it('gives callers whose address cannot be told one allowance between them', async () => {
    const { app } = appLimitedTo(1, () => undefined);
    await app.request('/limited');

    expect((await app.request('/limited')).status).toBe(429);
  });
});
