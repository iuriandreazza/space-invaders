import { difficultyFor } from '../difficulty.ts';
import { createGame } from '../game.ts';

/** How many waves the digest covers: well past what the golden runs play through. */
export const GOLDEN_DIFFICULTY_WAVES = 60;

/** `JSON.stringify` writes a typed array as an object keyed by index; the bunkers' pixels should read as plain lists. */
const spellOutPixels = (_key: string, value: unknown): unknown => (value instanceof Uint8Array ? [...value] : value);

/**
 * A fingerprint of what a game starts from and of how the waves get harder. The golden runs only reach the first
 * few waves, so this is what notices a change to the tables further on. It only has to notice change, it is not a
 * security measure.
 */
export async function layoutDigest(waves = GOLDEN_DIFFICULTY_WAVES): Promise<string> {
  const parts = [
    JSON.stringify(createGame(), spellOutPixels),
    ...Array.from({ length: waves }, (_, index) => JSON.stringify(difficultyFor(index + 1))),
  ];
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('\n')));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
