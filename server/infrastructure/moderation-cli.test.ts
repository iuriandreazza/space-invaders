import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../../shared/game/replay.ts';
import { FakeRunVerifier } from '../testing/fakes.ts';
import { InMemoryLeaderboardStore } from './in-memory-leaderboard-store.ts';
import { parseModerationCommand, runModerationCommand, UsageError } from './moderation-cli.ts';

describe('parseModerationCommand', () => {
  it('reads list, with or without a limit', () => {
    expect(parseModerationCommand(['list'])).toEqual({ kind: 'list', limit: 50 });
    expect(parseModerationCommand(['list', '--limit', '5'])).toEqual({ kind: 'list', limit: 5 });
    expect(parseModerationCommand(['list', '--limit', '10000'])).toEqual({ kind: 'list', limit: 10_000 });
  });

  it('reads remove, with every id once', () => {
    expect(parseModerationCommand(['remove', '3', '7', '3', '12'])).toEqual({ kind: 'remove', ids: [3, 7, 12] });
  });

  it('reads reverify, with or without --remove', () => {
    expect(parseModerationCommand(['reverify'])).toEqual({ kind: 'reverify', remove: false });
    expect(parseModerationCommand(['reverify', '--remove'])).toEqual({ kind: 'reverify', remove: true });
  });

  it.each([
    ['no command at all', []],
    ['an unknown command', ['delete', '1']],
    ['list with a limit and no number', ['list', '--limit']],
    ['list with a limit of zero', ['list', '--limit', '0']],
    ['list with a negative limit', ['list', '--limit', '-3']],
    ['list with a limit that is not a number', ['list', '--limit', 'many']],
    ['list with a fractional limit', ['list', '--limit', '1.5']],
    ['list with a limit above what is kept', ['list', '--limit', '10001']],
    ['list with an option it does not know', ['list', '--offset', '3']],
    ['list with more than it takes', ['list', '--limit', '5', 'extra']],
    ['remove with no id', ['remove']],
    ['remove with an id that is not a number', ['remove', 'abc']],
    ['remove with an id of zero', ['remove', '0']],
    ['remove with a negative id', ['remove', '-1']],
    ['remove with a fractional id', ['remove', '1.5']],
    ['remove with an id written in exponent form', ['remove', '1e3']],
    ['remove with an id too big to be exact', ['remove', '99999999999999999999']],
    ['remove with a good id and a bad one', ['remove', '4', 'x']],
    ['reverify with an option it does not know', ['reverify', '--force']],
    ['reverify with more than it takes', ['reverify', '--remove', '--remove']],
  ])('refuses %s', (_what, args) => {
    expect(() => parseModerationCommand(args)).toThrow(UsageError);
  });
});

function setup() {
  const store = new InMemoryLeaderboardStore();
  const verifier = new FakeRunVerifier();
  const logged: string[] = [];
  const failed: string[] = [];
  const output = {
    log: (line: string) => void logged.push(line),
    error: (line: string) => void failed.push(line),
  };
  const run = (...args: string[]) => runModerationCommand(args, { store, verifier }, output);

  let nextSession = 0;
  /** Keeps a score the way the server would have: `replay` and `engineVersion` as given, a stored `score`. */
  function keep(initials: string, score: number, replay?: number[], engineVersion = ENGINE_VERSION): void {
    nextSession += 1;
    store.addScore({
      sessionId: `s${nextSession}`,
      initials,
      score,
      achievedAt: Date.UTC(2026, 9, 1, 12, 0, nextSession),
      ...(replay === undefined ? {} : { engineVersion, replay }),
    });
  }

  return { store, verifier, logged, failed, run, keep };
}

describe('runModerationCommand', () => {
  describe('list', () => {
    it('shows the best scores with the id that removes each, its rank, initials, score and date', () => {
      const { run, keep, logged } = setup();
      keep('LOW', 100);
      keep('TOP', 900);

      expect(run('list')).toBe(0);

      expect(logged).toEqual([
        '      id   rank  initials    score  achieved at',
        '       2      1  TOP           900  2026-10-01T12:00:02.000Z',
        '       1      2  LOW           100  2026-10-01T12:00:01.000Z',
      ]);
    });

    it('shows no more than the limit, from the top', () => {
      const { run, keep, logged } = setup();
      keep('LOW', 100);
      keep('MID', 500);
      keep('TOP', 900);

      run('list', '--limit', '2');

      expect(logged.slice(1).map((line) => line.trim().split(/\s+/)[2])).toEqual(['TOP', 'MID']);
    });

    it('says so when there is nothing to show', () => {
      const { run, logged } = setup();

      expect(run('list')).toBe(0);
      expect(logged).toEqual(['No scores yet.']);
    });
  });

  describe('remove', () => {
    it('deletes the scores with the given ids and says which', () => {
      const { run, keep, store, logged } = setup();
      keep('AAA', 100);
      keep('BBB', 200);
      keep('CCC', 300);

      expect(run('remove', '1', '3')).toBe(0);

      expect(logged).toEqual(['Removed 2 score(s): 1, 3.']);
      expect(store.topScores(10).map((entry) => entry.initials)).toEqual(['BBB']);
    });

    it('still removes the scores that exist, but reports the ones that do not and exits with a failure', () => {
      const { run, keep, store, logged, failed } = setup();
      keep('AAA', 100);

      expect(run('remove', '1', '42')).toBe(1);

      expect(logged).toEqual(['Removed 1 score(s): 1.']);
      expect(failed).toEqual(['There is no score with id 42.']);
      expect(store.topScores(10)).toEqual([]);
    });
  });

  describe('reverify', () => {
    function seed() {
      const world = setup();
      const { keep, verifier } = world;
      keep('GOD', 500, verifier.recordRun(500));
      keep('LIE', 600, verifier.recordRun(500));
      keep('BAD', 700, verifier.recordFailure('unfinished'));
      keep('OLD', 800, [1, 1], ENGINE_VERSION - 1);
      keep('NIL', 900);
      return world;
    }

    it('lists what does not check out and what it had to skip, and changes nothing', () => {
      const { run, store, logged } = seed();

      expect(run('reverify')).toBe(1);

      const listing = logged.join('\n');
      expect(listing).toMatch(/2 +LIE +600 +mismatch +the replay scores 500/);
      expect(listing).toMatch(/3 +BAD +700 +invalid +unfinished/);
      expect(listing).toMatch(new RegExp(`4 +OLD +800 +skipped +engine v${ENGINE_VERSION - 1}`));
      expect(listing).toMatch(/5 +NIL +900 +skipped +no recording/);
      expect(listing).not.toContain('GOD');
      expect(logged.at(-1)).toBe('Checked 3 recording(s): 2 problem(s), 2 skipped.');
      expect(store.topScores(10)).toHaveLength(5);
    });

    it('removes the scores that do not check out when asked to, and only those', () => {
      const { run, store, logged } = seed();

      expect(run('reverify', '--remove')).toBe(1);

      expect(logged.at(-1)).toBe('Removed 2 score(s).');
      expect(store.topScores(10).map((entry) => entry.initials)).toEqual(['NIL', 'OLD', 'GOD']);
    });

    it('is content when every recording checks out, and exits with success', () => {
      const { run, keep, verifier, logged } = setup();
      keep('ONE', 100, verifier.recordRun(100));
      keep('TWO', 200, verifier.recordRun(200));

      expect(run('reverify')).toBe(0);
      expect(logged).toEqual(['Checked 2 recording(s): 0 problem(s), 0 skipped.']);
    });

    it('does not count scores it could not judge as problems', () => {
      const { run, keep, logged } = setup();
      keep('OLD', 800, [1, 1], ENGINE_VERSION + 1);
      keep('NIL', 900);

      expect(run('reverify', '--remove')).toBe(0);
      expect(logged.at(-1)).toBe('Checked 0 recording(s): 0 problem(s), 2 skipped.');
    });

    it('has the verifier play each recording exactly once', () => {
      const { run, verifier } = seed();

      run('reverify');

      expect(verifier.asked).toHaveLength(3);
    });
  });

  describe('when the command is wrong', () => {
    it.each([[[]], [['frobnicate']], [['remove']], [['list', '--limit', '0']]])(
      'says what is wrong, shows how to use it, touches nothing and exits with 2 (%j)',
      (args) => {
        const { run, keep, store, logged, failed } = setup();
        keep('AAA', 100);

        expect(run(...args)).toBe(2);

        expect(failed.length).toBe(2);
        expect(failed[1]).toContain('Usage:');
        expect(failed[1]).toContain('reverify');
        expect(logged).toEqual([]);
        expect(store.topScores(10)).toHaveLength(1);
      },
    );
  });
});
