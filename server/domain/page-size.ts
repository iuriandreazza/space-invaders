import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../shared/leaderboard-contract.ts';
import { invalid, valid, type Parsed } from './parsed.ts';

const DECIMAL_DIGITS = /^[0-9]+$/;

/**
 * Parses the raw text of the `limit` query parameter; a missing parameter means the default page size.
 * Number() would also accept values such as "0x10", "1e1" or "" so the text is checked first.
 */
export function parsePageSize(rawLimit: string | undefined): Parsed<number> {
  if (rawLimit === undefined) {
    return valid(DEFAULT_PAGE_SIZE);
  }
  const size = Number(rawLimit);
  if (DECIMAL_DIGITS.test(rawLimit) && size >= 1 && size <= MAX_PAGE_SIZE) {
    return valid(size);
  }
  return invalid(`limit must be an integer between 1 and ${MAX_PAGE_SIZE}.`);
}
