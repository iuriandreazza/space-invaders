/**
 * Initials end up on a public board, so the plainly vulgar or hateful ones are refused. This is a first line of
 * defence, not a moderation system: it only holds strings whose everyday reading is a slur or an obscenity.
 * Abbreviations with a real use (country codes, club names, units) are left out on purpose, and anything craftier is
 * for the moderation CLI.
 */
export const BLOCKED_INITIALS: ReadonlySet<string> = new Set([
  // Obscenities and their usual respellings.
  'ASS', 'AZZ', 'CUM', 'DCK', 'DIK', 'FUC', 'FUK', 'FUQ', 'FUX', 'FVK', 'JIZ', 'SEX', 'SHT', 'TIT',
  // Slurs.
  'FAG', 'FGT', 'NIG', 'WOP',
  // Hate groups and harassment.
  'KKK', 'KYS', 'NZI',
  // Brazilian Portuguese obscenity.
  'PQP',
]);

/** Players swap letters for the digits that look like them to slip past word filters: 5H7 reads as SHT. */
const DIGIT_LOOK_ALIKES: Readonly<Record<string, string>> = { '0': 'O', '1': 'I', '3': 'E', '4': 'A', '5': 'S', '7': 'T' };

function readAsLetters(initials: string): string {
  return initials.toUpperCase().replace(/[013457]/g, (digit) => DIGIT_LOOK_ALIKES[digit]);
}

/** Case-insensitive, so the UI can ask while the player is still typing. */
export function isInitialsAllowed(initials: string): boolean {
  return !BLOCKED_INITIALS.has(readAsLetters(initials));
}
