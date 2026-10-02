import { describe, expect, it } from 'vitest';
import { SCREEN_HEIGHT } from '../../../shared/game/constants.ts';
import { fillDisc, fillRing, strokeBox } from './drawing.ts';
import { createRecordingContext, type RecordedRect } from './testSupport.ts';

function pixelsOf(rects: RecordedRect[]): Set<string> {
  const pixels = new Set<string>();
  for (const { x, y, width, height } of rects) {
    for (let dx = 0; dx < width; dx++) for (let dy = 0; dy < height; dy++) pixels.add(`${x + dx},${y + dy}`);
  }
  return pixels;
}

/** Every pixel whose center is no farther than `outer` and farther than `inner` from the center, found the slow way. */
function expectedRing(centerX: number, centerY: number, inner: number, outer: number): Set<string> {
  const pixels = new Set<string>();
  for (let x = centerX - outer; x <= centerX + outer; x++) {
    for (let y = Math.max(0, centerY - outer); y <= Math.min(SCREEN_HEIGHT - 1, centerY + outer); y++) {
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance <= outer && distance > inner) pixels.add(`${x},${y}`);
    }
  }
  return pixels;
}

describe('fillDisc', () => {
  it.each([0, 1, 4, 9])('covers exactly the pixels within radius %i', (radius) => {
    const { ctx, rects } = createRecordingContext();

    fillDisc(ctx, 50, 60, radius);

    expect(pixelsOf(rects)).toEqual(expectedRing(50, 60, -1, radius));
  });

  it('does not draw rectangles that go negative for a negative radius', () => {
    const { ctx, rects } = createRecordingContext();

    fillDisc(ctx, 10, 10, -3);

    expect(rects.every((rect) => rect.width >= 1)).toBe(true);
  });
});

describe('fillRing', () => {
  it.each([
    [10, 6],
    [4, 3],
    [30, 20],
  ])('covers exactly the pixels between the radii %i and %i', (outer, inner) => {
    const { ctx, rects } = createRecordingContext();

    fillRing(ctx, 100, 150, inner, outer);

    expect(pixelsOf(rects)).toEqual(expectedRing(100, 150, inner, outer));
  });

  it('turns into a disc when there is no hole', () => {
    const { ctx, rects } = createRecordingContext();

    fillRing(ctx, 100, 150, -2, 5);

    expect(pixelsOf(rects)).toEqual(expectedRing(100, 150, -1, 5));
  });

  it('skips the rows that are off the screen', () => {
    const { ctx, rects } = createRecordingContext();

    fillRing(ctx, 100, 3, 10, 14);
    fillRing(ctx, 100, SCREEN_HEIGHT - 2, 10, 14);

    expect(rects.every((rect) => rect.y >= 0 && rect.y < SCREEN_HEIGHT)).toBe(true);
    expect(rects.length).toBeGreaterThan(0);
  });
});

describe('strokeBox', () => {
  it('draws the outline and leaves the inside alone', () => {
    const { ctx, rects } = createRecordingContext();

    strokeBox(ctx, 2, 3, 5, 4, '#fff');

    const pixels = pixelsOf(rects);
    expect(pixels.size).toBe(5 * 4 - 3 * 2);
    expect(pixels.has('4,4')).toBe(false);
    expect(pixels.has('2,3')).toBe(true);
    expect(pixels.has('6,6')).toBe(true);
  });
});
