import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../shared/leaderboard-contract.ts';
import { parsePageSize } from './page-size.ts';

describe('parsePageSize', () => {
  it('falls back to the default page size when the limit is absent', () => {
    expect(parsePageSize(undefined)).toEqual({ ok: true, value: DEFAULT_PAGE_SIZE });
  });

  it.each([
    ['1', 1],
    ['10', 10],
    ['007', 7],
    [String(MAX_PAGE_SIZE), MAX_PAGE_SIZE],
  ])('accepts %s', (rawLimit, expected) => {
    expect(parsePageSize(rawLimit)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['zero', '0'],
    ['above the maximum', String(MAX_PAGE_SIZE + 1)],
    ['an absurdly long number', '9'.repeat(400)],
    ['negative', '-1'],
    ['fractional', '1.5'],
    ['empty', ''],
    ['not a number', 'abc'],
    ['a number followed by text', '10abc'],
    ['hexadecimal', '0x10'],
    ['exponential', '1e1'],
    ['surrounded by whitespace', ' 5 '],
    ['signed', '+5'],
    ['a non-ASCII digit', '５'],
  ])('rejects a limit that is %s', (_name, rawLimit) => {
    const result = parsePageSize(rawLimit);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('limit');
    }
  });
});
