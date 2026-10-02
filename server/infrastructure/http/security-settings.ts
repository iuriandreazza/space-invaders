import type { Clock } from '../../application/ports.ts';
import { systemClock } from '../system-clock.ts';
import { createClientAddressResolver, type ClientAddressResolver } from './client-address.ts';

/** What one client may ask of the API, in requests per window. */
export interface RateLimitSettings {
  readonly windowMs: number;
  readonly startSession: number;
  readonly submitScore: number;
  readonly topScores: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitSettings = {
  windowMs: 60_000,
  startSession: 30,
  submitScore: 20,
  topScores: 120,
};

export interface SecuritySettings {
  readonly rateLimits?: Partial<RateLimitSettings>;
  readonly clock?: Clock;
  /**
   * How many reverse proxies stand between the clients and the server, each appending to X-Forwarded-For.
   * Zero, the default, means none: the header is then ignored.
   */
  readonly trustProxy?: number;
  /** Off by default: the logs say what happened without saying who did it. */
  readonly logClientAddress?: boolean;
  /** Overrides how the caller is identified; tests use it to be deterministic. */
  readonly clientAddress?: ClientAddressResolver;
}

export interface ResolvedSecuritySettings {
  readonly rateLimits: RateLimitSettings;
  readonly clock: Clock;
  readonly clientAddress: ClientAddressResolver;
  readonly logClientAddress: boolean;
}

export function resolveSecuritySettings(settings: SecuritySettings = {}): ResolvedSecuritySettings {
  return {
    rateLimits: { ...DEFAULT_RATE_LIMITS, ...settings.rateLimits },
    clock: settings.clock ?? systemClock,
    clientAddress: settings.clientAddress ?? createClientAddressResolver(settings.trustProxy ?? 0),
    logClientAddress: settings.logClientAddress ?? false,
  };
}
