import type { Context, MiddlewareHandler } from 'hono';
import type { Clock } from '../../application/ports.ts';
import { networkOf } from './client-address.ts';
import { jsonError } from './error-responses.ts';

/** Past this many tracked clients, windows that have ended are swept out before another client is added. */
const SWEEP_THRESHOLD = 10_000;
/** The hard bound on memory: past this many clients the oldest windows are dropped, ended or not. */
const MAX_TRACKED_CLIENTS = 100_000;
/** Callers that cannot be told apart, as with app.request(), share one allowance. */
const UNKNOWN_CLIENT = 'unknown';

interface Window {
  count: number;
  readonly resetsAt: number;
}

export interface RateLimitVerdict {
  readonly limited: boolean;
  /** True for the one request that first goes over the limit in a window. */
  readonly firstRefusal: boolean;
  readonly retryAfterSeconds: number;
}

export interface FixedWindowOptions {
  /** Requests allowed per client and window. */
  readonly limit: number;
  readonly windowMs: number;
  readonly clock: Clock;
}

/** Counts requests per client in fixed windows that start with the client's first request. */
export class FixedWindowCounter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #clock: Clock;
  // Windows are inserted when they start and all last the same time, so the Map is also in the order they end.
  readonly #windows = new Map<string, Window>();

  constructor({ limit, windowMs, clock }: FixedWindowOptions) {
    this.#limit = limit;
    this.#windowMs = windowMs;
    this.#clock = clock;
  }

  /** How many clients are being tracked. */
  get trackedClients(): number {
    return this.#windows.size;
  }

  hit(client: string): RateLimitVerdict {
    const now = this.#clock.now();
    const current = this.#windows.get(client);
    const window = current !== undefined && current.resetsAt > now ? current : this.#startWindow(client, now);
    window.count += 1;
    return {
      limited: window.count > this.#limit,
      firstRefusal: window.count === this.#limit + 1,
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetsAt - now) / 1000)),
    };
  }

  #startWindow(client: string, now: number): Window {
    // Inserting again moves the client to the end, which keeps the Map in the order the windows end.
    this.#windows.delete(client);
    this.#makeRoom(now);
    const window: Window = { count: 0, resetsAt: now + this.#windowMs };
    this.#windows.set(client, window);
    return window;
  }

  #makeRoom(now: number): void {
    if (this.#windows.size >= SWEEP_THRESHOLD) {
      this.#sweepEnded(now);
    }
    while (this.#windows.size >= MAX_TRACKED_CLIENTS) {
      this.#evictOldest();
    }
  }

  #sweepEnded(now: number): void {
    for (const [client, window] of this.#windows) {
      if (window.resetsAt > now) {
        return;
      }
      this.#windows.delete(client);
    }
  }

  #evictOldest(): void {
    const oldest = this.#windows.keys().next();
    if (!oldest.done) {
      this.#windows.delete(oldest.value);
    }
  }
}

export interface RateLimitOptions extends FixedWindowOptions {
  readonly clientAddress: (c: Context) => string | undefined;
  /** Called once per client and window, on the first refusal, so a flood cannot also flood the log. */
  readonly onLimited: (c: Context, retryAfterSeconds: number) => void;
}

export function rateLimit({ clientAddress, onLimited, ...window }: RateLimitOptions): MiddlewareHandler {
  const counter = new FixedWindowCounter(window);
  return async (c, next) => {
    const verdict = counter.hit(networkOf(clientAddress(c)) ?? UNKNOWN_CLIENT);
    if (!verdict.limited) {
      await next();
      return;
    }
    if (verdict.firstRefusal) {
      onLimited(c, verdict.retryAfterSeconds);
    }
    c.header('Retry-After', String(verdict.retryAfterSeconds));
    return jsonError(c, 429, 'rate_limited', 'Too many requests. Try again later.');
  };
}
