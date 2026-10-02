import { describe, expect, it } from 'vitest';
import { BLOCKED_INITIALS, isInitialsAllowed } from './blocked-initials.ts';
import { INITIALS_LENGTH } from './initials.ts';

describe('isInitialsAllowed', () => {
  it('refuses every listed string', () => {
    for (const blocked of BLOCKED_INITIALS) {
      expect(isInitialsAllowed(blocked), blocked).toBe(false);
    }
  });

  it.each(['ass', 'Sex', 'fUk', 'kkk'])('ignores the case of %s', (initials) => {
    expect(isInitialsAllowed(initials)).toBe(false);
  });

  describe('sees through digits that stand in for letters', () => {
    it.each([
      ['0 for O', 'W0P'],
      ['1 for I', 'T1T'],
      ['3 for E', 'S3X'],
      ['4 for A', 'F4G'],
      ['5 for S', '5EX'],
      ['7 for T', '7IT'],
      ['several at once', '5H7'],
      ['all of the word', 'A55'],
      ['a digit in a word that needs none of them', 'D1K'],
    ])('%s: %s', (_substitution, initials) => {
      expect(isInitialsAllowed(initials)).toBe(false);
    });
  });

  it.each([
    'ABC',
    'AAA',
    'JRM',
    'MVP',
    'IUR',
    'CAT',
    'DOG',
    'ACE',
    'PRO',
    'MAX',
    'ASH',
    'ASK',
    'SHE',
    'THE',
    'CUT',
    'CUP',
    'FUN',
    'FOX',
    'FAB',
    'NIK',
    'TIM',
    'SAM',
  ])('lets the ordinary %s through', (initials) => {
    expect(isInitialsAllowed(initials)).toBe(true);
  });

  it.each(['007', 'R2D', 'B52', '420', '911', 'N00', 'J05', '123'])(
    'lets the legitimate mix of digits %s through',
    (initials) => {
      expect(isInitialsAllowed(initials)).toBe(true);
    },
  );

  it.each([
    ['NGR', "Nigeria's country code"],
    ['FCK', 'a football club abbreviation'],
    ['CNT', 'a union and a unit'],
  ])('lets %s through, as %s', (initials) => {
    expect(isInitialsAllowed(initials)).toBe(true);
  });
});

describe('BLOCKED_INITIALS', () => {
  it('only holds uppercase strings of the length initials have, so every entry can match', () => {
    for (const blocked of BLOCKED_INITIALS) {
      expect(blocked).toMatch(new RegExp(`^[A-Z]{${INITIALS_LENGTH}}$`));
    }
  });
});
