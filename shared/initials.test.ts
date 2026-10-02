import { describe, expect, it } from 'vitest';
import { INITIALS_LENGTH, isValidInitials, sanitizeInitials } from './initials.ts';

describe('sanitizeInitials', () => {
  it('uppercases, drops what is not a letter or a digit and keeps three characters', () => {
    expect(sanitizeInitials('ab-1x')).toBe('AB1');
    expect(sanitizeInitials(' a b c ')).toBe('ABC');
    expect(sanitizeInitials('ábç')).toBe('B');
    expect(sanitizeInitials('<script>')).toBe('SCR');
    expect(sanitizeInitials('')).toBe('');
  });

  it('never gives back more than INITIALS_LENGTH characters', () => {
    expect(sanitizeInitials('ABCDEFGH')).toHaveLength(INITIALS_LENGTH);
  });
});

describe('isValidInitials', () => {
  it.each(['ABC', 'AB1', '007', 'ZZ9'])('accepts %s', (value) => {
    expect(isValidInitials(value)).toBe(true);
  });

  it.each(['abc', 'AB', 'ABCD', 'A-C', 'A C', 'ÁBC', 'AB\n', '\nABC', 'ABC\n', '', '<b>'])('refuses %j', (value) => {
    expect(isValidInitials(value)).toBe(false);
  });

  it.each([null, undefined, 123, ['A', 'B', 'C'], { toString: () => 'ABC' }])('refuses a value that is not a string: %j', (value) => {
    expect(isValidInitials(value)).toBe(false);
  });
});
