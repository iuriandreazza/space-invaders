import type { AnalyticsPort } from '../../application/ports.ts';

/** Stands in wherever visits are not to be counted: development, tests, and a build without a measurement id. */
export const silentAnalytics: AnalyticsPort = {
  start: () => undefined,
  stop: () => undefined,
};
