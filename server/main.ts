import { serve } from '@hono/node-server';
import { mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { LeaderboardService } from './application/leaderboard-service.ts';
import { loadConfig } from './infrastructure/config.ts';
import { EngineRunVerifier } from './infrastructure/engine-run-verifier.ts';
import { createApp } from './infrastructure/http/create-app.ts';
import { HTTP_SERVER_LIMITS } from './infrastructure/http/server-limits.ts';
import { createSessionId } from './infrastructure/session-id.ts';
import { SqliteLeaderboardStore } from './infrastructure/sqlite-leaderboard-store.ts';
import { systemClock } from './infrastructure/system-clock.ts';

function isDirectory(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

const config = loadConfig(process.env, isDirectory);

mkdirSync(dirname(config.databasePath), { recursive: true });
const store = new SqliteLeaderboardStore(config.databasePath);
const service = new LeaderboardService({
  store,
  clock: systemClock,
  ids: { next: createSessionId },
  verifier: new EngineRunVerifier(),
});
const app = createApp({
  service,
  staticDir: config.staticDir,
  security: { trustProxy: config.trustProxy, logClientAddress: config.logClientAddress },
  revision: config.revision,
});

const server = serve({ fetch: app.fetch, port: config.port, serverOptions: HTTP_SERVER_LIMITS }, ({ port }) => {
  console.log(
    `Space Invaders API listening on http://localhost:${port} (database: ${config.databasePath}, static files: ${config.staticDir ?? 'none'}, trusted proxies: ${config.trustProxy}, revision: ${config.revision ?? 'unknown'})`,
  );
});

let shuttingDown = false;

function shutdown(): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  // close() stops accepting connections and calls back once the in-flight ones have finished.
  server.close((error) => {
    store.close();
    process.exit(error ? 1 : 0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
