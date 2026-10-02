import { describe, expect, it } from 'vitest';
import { circleTouchesRect, rectsOverlap } from './collision.ts';

const box = { x: 10, y: 10, width: 10, height: 10 };

describe('rectsOverlap', () => {
  it('is true for boxes that share some area', () => {
    expect(rectsOverlap(box, { x: 15, y: 15, width: 10, height: 10 })).toBe(true);
    expect(rectsOverlap(box, { x: 12, y: 12, width: 2, height: 2 })).toBe(true);
  });

  it('is false for boxes that only touch or are apart', () => {
    expect(rectsOverlap(box, { x: 20, y: 10, width: 5, height: 5 })).toBe(false);
    expect(rectsOverlap(box, { x: 10, y: 20, width: 5, height: 5 })).toBe(false);
    expect(rectsOverlap(box, { x: 30, y: 30, width: 5, height: 5 })).toBe(false);
  });
});

describe('circleTouchesRect', () => {
  it('is true for a center inside the box, whatever the radius', () => {
    expect(circleTouchesRect({ x: 15, y: 15 }, 0, box)).toBe(true);
  });

  it('is true when the edge of the circle reaches a side of the box, and false just short of it', () => {
    expect(circleTouchesRect({ x: 5, y: 15 }, 5, box)).toBe(true);
    expect(circleTouchesRect({ x: 5, y: 15 }, 4.9, box)).toBe(false);
  });

  it('measures the corner by distance, not by the box around the circle', () => {
    // 3-4-5 from the corner (20, 20): inside at 5, outside just below.
    expect(circleTouchesRect({ x: 23, y: 24 }, 5, box)).toBe(true);
    expect(circleTouchesRect({ x: 23, y: 24 }, 4.9, box)).toBe(false);
  });
});
