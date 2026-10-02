const DEFAULT_PORT = 8787;
const MAX_PORT = 65_535;
const DEFAULT_DATABASE_PATH = 'data/leaderboard.sqlite';
const DEFAULT_STATIC_DIR = 'dist';

const PORT_PATTERN = /^[0-9]{1,5}$/;
/** A commit hash, SHA-1 or SHA-256, in lower case. */
const REVISION_PATTERN = /^[0-9a-f]{7,64}$/;
const TRUST_PROXY_PATTERN = /^[0-9]{1,2}$/;

export interface ServerConfig {
  readonly port: number;
  readonly databasePath: string;
  /** Undefined when the API should not host the web client. */
  readonly staticDir: string | undefined;
  /** How many reverse proxies stand in front of the server, each appending to X-Forwarded-For; 0 for none. */
  readonly trustProxy: number;
  readonly logClientAddress: boolean;
  /** The commit this build comes from, set by the image build; undefined for a local run. */
  readonly revision: string | undefined;
}

/** A variable that is set but blank counts as unset, as `.env` files often declare `NAME=` to mean "default". */
function readVariable(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === '' ? undefined : value;
}

function parsePort(rawPort: string | undefined): number {
  if (rawPort === undefined) {
    return DEFAULT_PORT;
  }
  if (!PORT_PATTERN.test(rawPort) || Number(rawPort) > MAX_PORT) {
    throw new Error(`PORT must be an integer between 0 and ${MAX_PORT}, got "${rawPort}".`);
  }
  return Number(rawPort);
}

function parseTrustProxy(rawProxies: string | undefined): number {
  if (rawProxies === undefined) {
    return 0;
  }
  if (!TRUST_PROXY_PATTERN.test(rawProxies)) {
    throw new Error(`TRUST_PROXY must be the number of reverse proxies, from 0 to 99, got "${rawProxies}".`);
  }
  return Number(rawProxies);
}

function parseFlag(name: string, rawFlag: string | undefined): boolean {
  if (rawFlag === undefined) {
    return false;
  }
  const flag = rawFlag.toLowerCase();
  if (flag !== 'true' && flag !== 'false') {
    throw new Error(`${name} must be "true" or "false", got "${rawFlag}".`);
  }
  return flag === 'true';
}

function parseRevision(rawRevision: string | undefined): string | undefined {
  if (rawRevision === undefined) {
    return undefined;
  }
  if (!REVISION_PATTERN.test(rawRevision)) {
    throw new Error(`APP_REVISION must be a lower case commit hash, got "${rawRevision}".`);
  }
  return rawRevision;
}

function resolveStaticDir(configured: string | undefined, isDirectory: (path: string) => boolean): string | undefined {
  if (configured === undefined) {
    return isDirectory(DEFAULT_STATIC_DIR) ? DEFAULT_STATIC_DIR : undefined;
  }
  // An explicit but wrong path would otherwise surface as a silently empty site.
  if (!isDirectory(configured)) {
    throw new Error(`STATIC_DIR must be an existing directory, got "${configured}".`);
  }
  return configured;
}

/** Apart from the rest of the configuration so that the moderation CLI, which needs only the database, ignores a bad PORT. */
export function readDatabasePath(env: NodeJS.ProcessEnv): string {
  return readVariable(env, 'DATABASE_PATH') ?? DEFAULT_DATABASE_PATH;
}

export function loadConfig(env: NodeJS.ProcessEnv, isDirectory: (path: string) => boolean): ServerConfig {
  return {
    port: parsePort(readVariable(env, 'PORT')),
    databasePath: readDatabasePath(env),
    staticDir: resolveStaticDir(readVariable(env, 'STATIC_DIR'), isDirectory),
    trustProxy: parseTrustProxy(readVariable(env, 'TRUST_PROXY')),
    logClientAddress: parseFlag('LOG_CLIENT_ADDRESS', readVariable(env, 'LOG_CLIENT_ADDRESS')),
    revision: parseRevision(readVariable(env, 'APP_REVISION')),
  };
}
