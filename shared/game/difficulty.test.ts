import { describe, expect, it } from 'vitest';
import { MAX_EXTRA_HP } from './constants.ts';
import { difficultyFor } from './difficulty.ts';

describe('difficultyFor', () => {
  const waves = Array.from({ length: 80 }, (_, index) => difficultyFor(index + 1));

  it('only gets harder wave after wave', () => {
    waves.slice(1).forEach((harder, index) => {
      const easier = waves[index]!;
      expect(harder.fleetStartY).toBeGreaterThanOrEqual(easier.fleetStartY);
      expect(harder.stepTickScale).toBeLessThanOrEqual(easier.stepTickScale);
      expect(harder.bombInterval).toBeLessThanOrEqual(easier.bombInterval);
      expect(harder.maxBombs).toBeGreaterThanOrEqual(easier.maxBombs);
      expect(harder.extraHp).toBeGreaterThanOrEqual(easier.extraHp);
    });
  });

  it('levels off, so that no wave is out of reach by arithmetic alone', () => {
    const last = waves.at(-1)!;
    expect(last.extraHp).toBe(MAX_EXTRA_HP);
    expect(last.stepTickScale).toBeGreaterThan(0);
    expect(last.bombInterval).toBeGreaterThan(0);
  });

  it('starts the first wave with nothing added', () => {
    expect(waves[0]!.extraHp).toBe(0);
    expect(waves[0]!.stepTickScale).toBe(1);
  });
});
