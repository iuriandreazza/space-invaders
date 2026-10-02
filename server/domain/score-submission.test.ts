import { describe, expect, it } from 'vitest';
import { MAX_DISPLAYED_SCORE } from '../../shared/game/constants.ts';
import { MAX_REPLAY_RUNS, MAX_REPLAY_TICKS } from '../../shared/game/replay.ts';
import { buildSubmitScoreRequest } from '../testing/requests.ts';
import { MAX_SESSION_ID_LENGTH, parseScoreSubmission } from './score-submission.ts';

const validBody = buildSubmitScoreRequest({ score: 1234 });

function rejectionMessage(input: unknown): string {
  const result = parseScoreSubmission(input);
  if (result.ok) {
    throw new Error(`Expected the input to be rejected: ${JSON.stringify(input).slice(0, 200)}`);
  }
  return result.message;
}

/** A replay of `runs` runs that is well-formed in every respect except possibly its size. */
function replayOfRuns(runs: number): number[] {
  return Array.from({ length: runs }, (_, run) => [run % 2, 1]).flat();
}

describe('parseScoreSubmission', () => {
  describe('accepts', () => {
    it('a well-formed submission', () => {
      expect(parseScoreSubmission(validBody)).toEqual({ ok: true, value: validBody });
    });

    it('unknown extra properties, which are dropped from the result', () => {
      const result = parseScoreSubmission({ ...validBody, admin: true });
      expect(result).toEqual({ ok: true, value: validBody });
    });

    it.each([
      ['the lowest score', { score: 1 }],
      ['the highest score', { score: MAX_DISPLAYED_SCORE }],
      ['a one character session id', { sessionId: 'x' }],
      ['the longest session id', { sessionId: 'x'.repeat(MAX_SESSION_ID_LENGTH) }],
      ['initials made of digits', { initials: '007' }],
      ['initials mixing letters and digits', { initials: 'A1Z' }],
      ['any engine version, as whether it is current is for the use case to judge', { engineVersion: 0 }],
      ['the most runs a replay may hold', { replay: replayOfRuns(MAX_REPLAY_RUNS) }],
      ['the longest replay there is', { replay: [0, MAX_REPLAY_TICKS] }],
    ])('%s', (_name, override) => {
      expect(parseScoreSubmission({ ...validBody, ...override }).ok).toBe(true);
    });

    it('initials the policy would refuse, as that is not a question of shape', () => {
      expect(parseScoreSubmission({ ...validBody, initials: 'ASS' }).ok).toBe(true);
    });
  });

  describe('rejects a body that is not a JSON object', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['a string', 'ABC'],
      ['a number', 42],
      ['a boolean', true],
      ['an array', [validBody]],
    ])('%s', (_name, input) => {
      expect(rejectionMessage(input)).toContain('JSON object');
    });
  });

  describe('rejects an invalid sessionId', () => {
    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['too long', 'x'.repeat(MAX_SESSION_ID_LENGTH + 1)],
      ['a number', 123],
      ['null', null],
      ['an object', { id: 'session-1' }],
    ])('%s', (_name, sessionId) => {
      expect(rejectionMessage({ ...validBody, sessionId })).toContain('sessionId');
    });
  });

  describe('rejects invalid initials', () => {
    it.each([
      ['missing', undefined],
      ['lowercase, which is not silently fixed', 'abc'],
      ['mixed case', 'Abc'],
      ['too short', 'AB'],
      ['too long', 'ABCD'],
      ['empty', ''],
      ['containing a symbol', 'AB!'],
      ['containing a space', 'A B'],
      ['padded with whitespace', ' ABC'],
      ['containing a non-ASCII letter', 'ÄBC'],
      ['a number', 123],
      ['null', null],
      ['an array of letters', ['A', 'B', 'C']],
    ])('%s', (_name, initials) => {
      expect(rejectionMessage({ ...validBody, initials })).toContain('initials');
    });
  });

  describe('rejects an invalid score', () => {
    it.each([
      ['missing', undefined],
      ['zero', 0],
      ['negative zero', -0],
      ['negative', -5],
      ['fractional', 1.5],
      ['above the maximum', MAX_DISPLAYED_SCORE + 1],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['a numeric string', '100'],
      ['null', null],
      ['a boolean', true],
      ['an array', [100]],
    ])('%s', (_name, score) => {
      expect(rejectionMessage({ ...validBody, score })).toContain('score');
    });
  });

  describe('rejects an invalid engineVersion', () => {
    it.each([
      ['missing', undefined],
      ['fractional', 1.5],
      ['a numeric string', '1'],
      ['null', null],
      ['a boolean', true],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
    ])('%s', (_name, engineVersion) => {
      expect(rejectionMessage({ ...validBody, engineVersion })).toContain('engineVersion');
    });
  });

  describe('rejects an invalid replay', () => {
    it.each([
      ['missing', undefined],
      ['null', null],
      ['empty', []],
      ['not an array', 'AAAA'],
      ['an object', { 0: 1, 1: 1, length: 2 }],
      ['an odd number of elements', [1, 1, 2]],
      ['holding a non-integer control', [1.5, 1]],
      ['holding a control that is a string', ['1', 1]],
      ['holding a control above the five buttons', [32, 1]],
      ['holding a negative control', [-1, 1]],
      ['holding a tick count of zero', [1, 0]],
      ['holding a fractional tick count', [1, 0.5]],
      ['holding a negative tick count', [1, -3]],
      ['merging nothing: neighbouring runs with the same controls', [1, 3, 1, 4]],
      ['more runs than a game can have', replayOfRuns(MAX_REPLAY_RUNS + 1)],
      ['longer than any game may last', [0, MAX_REPLAY_TICKS + 1]],
    ])('%s', (_name, replay) => {
      expect(rejectionMessage({ ...validBody, replay })).toContain('replay');
    });
  });

  it('reports the first invalid field when several are wrong', () => {
    const allWrong = { sessionId: '', initials: 'x', score: 0, engineVersion: 'v1', replay: [] };

    expect(rejectionMessage(allWrong)).toContain('sessionId');
    expect(rejectionMessage({ ...allWrong, sessionId: 'ok' })).toContain('initials');
    expect(rejectionMessage({ ...allWrong, sessionId: 'ok', initials: 'ABC' })).toContain('score');
    expect(rejectionMessage({ ...allWrong, sessionId: 'ok', initials: 'ABC', score: 5 })).toContain('engineVersion');
    expect(rejectionMessage({ ...allWrong, sessionId: 'ok', initials: 'ABC', score: 5, engineVersion: 1 })).toContain(
      'replay',
    );
  });

  describe('never repeats what it was sent', () => {
    it.each([
      ['a session id', { sessionId: 's'.repeat(MAX_SESSION_ID_LENGTH + 1) }, 'sssss'],
      ['initials', { initials: 'qzx9' }, 'qzx9'],
      ['a score', { score: 123456789.5 }, '123456789'],
      ['an engine version', { engineVersion: 'banana-version' }, 'banana'],
      ['a control', { replay: [77, 1] }, '77'],
      ['a tick count', { replay: [1, 424242.5] }, '424242'],
    ])('in the message about %s', (_name, override, fragment) => {
      expect(rejectionMessage({ ...validBody, ...override })).not.toContain(fragment);
    });
  });
});
