import { describe, expect, it } from 'vitest';
import { carveCrater, createBunkers, eraseUnder, findImpact } from './bunkers.ts';
import { BUNKER_COUNT, BUNKER_SIZE } from './constants.ts';

const standing = (pixels: Uint8Array): number => pixels.reduce((sum, pixel) => sum + pixel, 0);
const pixelAt = (pixels: Uint8Array, x: number, y: number): number => pixels[y * BUNKER_SIZE.width + x]!;

describe('createBunkers', () => {
  it('makes four identical shields, each with its own pixels', () => {
    const bunkers = createBunkers();
    expect(bunkers).toHaveLength(BUNKER_COUNT);
    expect(new Set(bunkers.map((bunker) => bunker.pixels)).size).toBe(BUNKER_COUNT);
    expect(new Set(bunkers.map((bunker) => standing(bunker.pixels))).size).toBe(1);
  });

  it('has its top corners cut and an arch at the bottom, like the classic', () => {
    const { pixels } = createBunkers()[0]!;
    expect(pixelAt(pixels, 0, 0)).toBe(0);
    expect(pixelAt(pixels, BUNKER_SIZE.width / 2, 0)).toBe(1);
    expect(pixelAt(pixels, BUNKER_SIZE.width / 2, BUNKER_SIZE.height - 1)).toBe(0);
    expect(pixelAt(pixels, 2, BUNKER_SIZE.height - 1)).toBe(1);
  });
});

describe('findImpact', () => {
  it('finds the lowest standing pixel a box covers, and nothing in the air', () => {
    const bunker = createBunkers()[0]!;
    const above = { x: bunker.x + 8, y: bunker.y - 10, width: 3, height: 7 };
    expect(findImpact(bunker, above)).toBeNull();

    const touching = { x: bunker.x + 8, y: bunker.y - 6, width: 3, height: 7 };
    expect(findImpact(bunker, touching)).toEqual({ x: 8, y: 0 });
  });

  it('sees the arch as air', () => {
    const bunker = createBunkers()[0]!;
    const inArch = { x: bunker.x + 10, y: bunker.y + 12, width: 3, height: 3 };
    expect(findImpact(bunker, inArch)).toBeNull();
  });
});

describe('eraseUnder', () => {
  it('removes what a box covers and reports whether there was anything', () => {
    const bunker = createBunkers()[0]!;
    const before = standing(bunker.pixels);
    const box = { x: bunker.x + 2, y: bunker.y + 2, width: 4, height: 4 };

    expect(eraseUnder(bunker, box)).toBe(true);
    expect(standing(bunker.pixels)).toBe(before - 16);
    expect(eraseUnder(bunker, box)).toBe(false);
  });

  it('ignores the part of a box that hangs outside the shield', () => {
    const bunker = createBunkers()[0]!;
    expect(() => eraseUnder(bunker, { x: bunker.x - 20, y: bunker.y - 20, width: 30, height: 30 })).not.toThrow();
  });
});

describe('carveCrater', () => {
  it('bites a hole around the impact, always the same one', () => {
    const [first, second] = createBunkers();
    carveCrater(first!, { x: 12, y: 5 });
    carveCrater(second!, { x: 12, y: 5 });

    expect(pixelAt(first!.pixels, 12, 5)).toBe(0);
    expect(standing(first!.pixels)).toBeLessThan(standing(createBunkers()[0]!.pixels));
    expect(first!.pixels).toEqual(second!.pixels);
  });

  it('stays within the shield when the impact is at its edge', () => {
    const bunker = createBunkers()[0]!;
    expect(() => carveCrater(bunker, { x: 0, y: BUNKER_SIZE.height - 1 })).not.toThrow();
    expect(() => carveCrater(bunker, { x: BUNKER_SIZE.width - 1, y: 0 })).not.toThrow();
  });
});
