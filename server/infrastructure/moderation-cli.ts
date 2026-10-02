import { ENGINE_VERSION } from '../../shared/game/replay.ts';
import type { RunVerifier, ScoreModerationStore } from '../application/ports.ts';
import type { StoredRun } from '../domain/score.ts';
import { DEFAULT_STORAGE_LIMITS } from '../domain/storage-limits.ts';

const DEFAULT_LIST_LIMIT = 50;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

const USAGE = [
  'Usage: <cli> <command>',
  '',
  'Commands:',
  `  list [--limit N]       Show the best scores with the ids that remove takes (default ${DEFAULT_LIST_LIMIT}, at most ${DEFAULT_STORAGE_LIMITS.maxScores})`,
  '  remove <id...>         Delete scores by id; their sessions go with them',
  '  reverify [--remove]    Play every stored recording again and list the scores that no longer check out;',
  '                         with --remove, delete those scores too',
  '',
  'DATABASE_PATH selects the database file, as it does for the server.',
].join('\n');

export interface ModerationTools {
  readonly store: ScoreModerationStore;
  readonly verifier: RunVerifier;
}

/** `console` fits. */
export type CommandOutput = Pick<Console, 'log' | 'error'>;

export type ModerationCommand =
  | { readonly kind: 'list'; readonly limit: number }
  | { readonly kind: 'remove'; readonly ids: readonly number[] }
  | { readonly kind: 'reverify'; readonly remove: boolean };

export class UsageError extends Error {}

function parsePositiveInteger(text: string, what: string): number {
  const value = Number(text);
  if (!/^[0-9]+$/.test(text) || !Number.isSafeInteger(value) || value < 1) {
    throw new UsageError(`${what} must be a positive whole number, got "${text}".`);
  }
  return value;
}

function parseList(rest: readonly string[]): ModerationCommand {
  if (rest.length === 0) {
    return { kind: 'list', limit: DEFAULT_LIST_LIMIT };
  }
  const [flag, value, ...extra] = rest;
  if (flag !== '--limit' || value === undefined || extra.length > 0) {
    throw new UsageError('list takes only an optional --limit N.');
  }
  const limit = parsePositiveInteger(value, 'The limit');
  if (limit > DEFAULT_STORAGE_LIMITS.maxScores) {
    throw new UsageError(`The limit cannot be more than ${DEFAULT_STORAGE_LIMITS.maxScores}.`);
  }
  return { kind: 'list', limit };
}

function parseRemove(rest: readonly string[]): ModerationCommand {
  if (rest.length === 0) {
    throw new UsageError('remove needs at least one score id.');
  }
  return { kind: 'remove', ids: [...new Set(rest.map((id) => parsePositiveInteger(id, 'A score id')))] };
}

function parseReverify(rest: readonly string[]): ModerationCommand {
  if (rest.length > 1 || (rest.length === 1 && rest[0] !== '--remove')) {
    throw new UsageError('reverify takes only an optional --remove.');
  }
  return { kind: 'reverify', remove: rest.length === 1 };
}

/** Throws UsageError when the arguments are not a command. */
export function parseModerationCommand(args: readonly string[]): ModerationCommand {
  const [name, ...rest] = args;
  switch (name) {
    case undefined:
      throw new UsageError('Missing command.');
    case 'list':
      return parseList(rest);
    case 'remove':
      return parseRemove(rest);
    case 'reverify':
      return parseReverify(rest);
    default:
      throw new UsageError(`Unknown command "${name}".`);
  }
}

function listRow(id: string, rank: string, initials: string, score: string, achievedAt: string): string {
  return `${id.padStart(8)}  ${rank.padStart(5)}  ${initials.padEnd(8)}  ${score.padStart(7)}  ${achievedAt}`;
}

function list(store: ScoreModerationStore, limit: number, output: CommandOutput): number {
  const scores = store.listScores(limit);
  if (scores.length === 0) {
    output.log('No scores yet.');
    return 0;
  }
  output.log(listRow('id', 'rank', 'initials', 'score', 'achieved at'));
  for (const { id, rank, initials, score, achievedAt } of scores) {
    output.log(listRow(String(id), String(rank), initials, String(score), new Date(achievedAt).toISOString()));
  }
  return 0;
}

function remove(store: ScoreModerationStore, ids: readonly number[], output: CommandOutput): number {
  const deleted = store.deleteScores(ids);
  if (deleted.length > 0) {
    output.log(`Removed ${deleted.length} score(s): ${deleted.join(', ')}.`);
  }
  const missing = ids.filter((id) => !deleted.includes(id));
  for (const id of missing) {
    output.error(`There is no score with id ${id}.`);
  }
  return missing.length === 0 ? 0 : EXIT_FAILURE;
}

interface Finding {
  readonly run: StoredRun;
  readonly status: 'invalid' | 'mismatch' | 'skipped';
  readonly detail: string;
}

/** Undefined when the stored score checks out. */
function reverifyRun(run: StoredRun, verifier: RunVerifier): Finding | undefined {
  if (run.replay === null) {
    return { run, status: 'skipped', detail: 'no recording' };
  }
  // A newer engine cannot play an older recording again, so what it cannot reproduce is not judged.
  if (run.engineVersion !== ENGINE_VERSION) {
    return { run, status: 'skipped', detail: `engine v${run.engineVersion ?? 'unknown'}` };
  }
  const verdict = verifier.verify(run.replay);
  if (!verdict.ok) {
    return { run, status: 'invalid', detail: verdict.reason };
  }
  return verdict.score === run.score
    ? undefined
    : { run, status: 'mismatch', detail: `the replay scores ${verdict.score}` };
}

function reverify(tools: ModerationTools, removeProblems: boolean, output: CommandOutput): number {
  const findings: Finding[] = [];
  let checked = 0;
  for (const run of tools.store.storedRuns()) {
    const finding = reverifyRun(run, tools.verifier);
    if (finding === undefined || finding.status !== 'skipped') {
      checked += 1;
    }
    if (finding !== undefined) {
      findings.push(finding);
    }
  }
  for (const { run, status, detail } of findings) {
    output.log(`${String(run.id).padStart(8)}  ${run.initials}  ${String(run.score).padStart(7)}  ${status.padEnd(8)}  ${detail}`);
  }

  const problems = findings.filter((finding) => finding.status !== 'skipped');
  output.log(`Checked ${checked} recording(s): ${problems.length} problem(s), ${findings.length - problems.length} skipped.`);
  if (removeProblems && problems.length > 0) {
    // Only after the walk: the store must not change under an iteration that is still reading it.
    output.log(`Removed ${tools.store.deleteScores(problems.map(({ run }) => run.id)).length} score(s).`);
  }
  return problems.length === 0 ? 0 : EXIT_FAILURE;
}

/** Runs one command and returns the exit code: 0 for success, 1 when something was wrong, 2 for a mistake in the usage. */
export function runModerationCommand(args: readonly string[], tools: ModerationTools, output: CommandOutput): number {
  try {
    const command = parseModerationCommand(args);
    switch (command.kind) {
      case 'list':
        return list(tools.store, command.limit, output);
      case 'remove':
        return remove(tools.store, command.ids, output);
      case 'reverify':
        return reverify(tools, command.remove, output);
    }
  } catch (error) {
    if (!(error instanceof UsageError)) {
      throw error;
    }
    output.error(error.message);
    output.error(USAGE);
    return EXIT_USAGE;
  }
}
