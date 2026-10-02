import { describe, expect, it } from 'vitest';
import { circleOutline, discHalfWidth, forEachLinePixel } from './pixelGeometry.ts';

function linePixels(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const pixels: Array<[number, number]> = [];
  forEachLinePixel(x0, y0, x1, y1, (x, y) => pixels.push([x, y]));
  return pixels;
}

function outlineKeys(radius: number): Set<string> {
  return new Set(circleOutline(radius).map(({ x, y }) => `${x},${y}`));
}

describe('forEachLinePixel', () => {
  it('visits a single pixel when both ends are the same', () => {
    expect(linePixels(5, 7, 5, 7)).toEqual([[5, 7]]);
  });

  it('walks a horizontal line', () => {
    expect(linePixels(2, 4, 5, 4)).toEqual([
      [2, 4],
      [3, 4],
      [4, 4],
      [5, 4],
    ]);
  });

  it('walks a vertical line upwards', () => {
    expect(linePixels(3, 6, 3, 3)).toEqual([
      [3, 6],
      [3, 5],
      [3, 4],
      [3, 3],
    ]);
  });

  it('walks a diagonal', () => {
    expect(linePixels(0, 0, 3, -3)).toEqual([
      [0, 0],
      [1, -1],
      [2, -2],
      [3, -3],
    ]);
  });

  it.each([
    [10, 300, 120, 190],
    [226, 302, 120, 190],
    [10, 300, 11, 20],
    [0, 0, 100, 3],
  ])('goes from %i,%i to %i,%i one connected pixel at a time', (x0, y0, x1, y1) => {
    const pixels = linePixels(x0, y0, x1, y1);
    expect(pixels[0]).toEqual([x0, y0]);
    expect(pixels.at(-1)).toEqual([x1, y1]);
    expect(pixels).toHaveLength(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) + 1);
    for (let i = 1; i < pixels.length; i++) {
      expect(Math.abs(pixels[i]![0] - pixels[i - 1]![0])).toBeLessThanOrEqual(1);
      expect(Math.abs(pixels[i]![1] - pixels[i - 1]![1])).toBeLessThanOrEqual(1);
    }
  });

  it('stops instead of looping forever when a coordinate is not a number', () => {
    expect(linePixels(0, 0, Number.NaN, 5)).toEqual([]);
  });
});

describe('circleOutline', () => {
  it.each([1, 3, 9])('keeps every pixel of the radius %i circle next to the true circle', (radius) => {
    for (const { x, y } of circleOutline(radius)) {
      expect(Math.abs(Math.hypot(x, y) - radius)).toBeLessThanOrEqual(0.55);
    }
  });

  it('lists each pixel once', () => {
    expect(outlineKeys(9).size).toBe(circleOutline(9).length);
  });

  it('is symmetric around its center', () => {
    const keys = outlineKeys(9);
    for (const { x, y } of circleOutline(9)) {
      expect(keys.has(`${-x},${y}`)).toBe(true);
      expect(keys.has(`${x},${-y}`)).toBe(true);
      expect(keys.has(`${y},${x}`)).toBe(true);
    }
  });

  it('touches the four extremes', () => {
    const keys = outlineKeys(9);
    for (const extreme of ['9,0', '-9,0', '0,9', '0,-9']) expect(keys.has(extreme)).toBe(true);
  });
});

describe('discHalfWidth', () => {
  it('is the radius on the middle row and shrinks towards the poles', () => {
    expect(discHalfWidth(5, 0)).toBe(5);
    expect(discHalfWidth(5, 3)).toBe(4);
    expect(discHalfWidth(5, 5)).toBe(0);
  });

  it('is zero beyond the disc', () => {
    expect(discHalfWidth(5, 6)).toBe(0);
  });
});
