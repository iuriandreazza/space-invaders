import { existsSync } from 'node:fs';
import { readDatabasePath } from './infrastructure/config.ts';
import { EngineRunVerifier } from './infrastructure/engine-run-verifier.ts';
import { runModerationCommand } from './infrastructure/moderation-cli.ts';
import { SqliteLeaderboardStore } from './infrastructure/sqlite-leaderboard-store.ts';

const databasePath = readDatabasePath(process.env);

// Opening a missing file would create it, and a mistyped DATABASE_PATH must not quietly moderate an empty database.
if (!existsSync(databasePath)) {
  console.error(`There is no database at ${databasePath}. Set DATABASE_PATH to the file the server uses.`);
  process.exit(1);
}

const store = new SqliteLeaderboardStore(databasePath);
try {
  process.exitCode = runModerationCommand(process.argv.slice(2), { store, verifier: new EngineRunVerifier() }, console);
} finally {
  store.close();
}
