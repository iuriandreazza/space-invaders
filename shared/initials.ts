export const INITIALS_LENGTH = 3;

const INITIALS_PATTERN = new RegExp(`^[A-Z0-9]{${INITIALS_LENGTH}}$`);

/** Uppercases the input and drops everything but A–Z and 0–9, keeping at most {@link INITIALS_LENGTH} characters. */
export function sanitizeInitials(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, INITIALS_LENGTH);
}

export function isValidInitials(value: unknown): value is string {
  return typeof value === 'string' && INITIALS_PATTERN.test(value);
}
