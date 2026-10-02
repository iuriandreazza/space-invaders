import type { Context } from 'hono';
import { routePath } from 'hono/route';
import { logSecurityEvent, type SecurityEvent, type SecurityLogFields } from '../security-log.ts';
import type { ResolvedSecuritySettings } from './security-settings.ts';

export type SecurityEventRecorder = (c: Context, event: SecurityEvent, fields?: SecurityLogFields) => void;

/** The one place that decides whether a log line may say who the caller was. */
export function createSecurityEventRecorder({
  clientAddress,
  logClientAddress,
}: Pick<ResolvedSecuritySettings, 'clientAddress' | 'logClientAddress'>): SecurityEventRecorder {
  return (c, event, fields = {}) => {
    logSecurityEvent(event, logClientAddress ? { ...fields, client: clientAddress(c) ?? 'unknown' } : fields);
  };
}

/** Names a route by its method and the path it was registered under, not by the path that was asked for. */
export function routeOf(c: Context): string {
  return `${c.req.method} ${routePath(c)}`;
}
