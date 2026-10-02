import type { Point } from '../../../shared/game/types.ts';

/**
 * The canvas anti-aliases every path it strokes, which would smear the pixel look.
 * These helpers decide which whole pixels a shape covers, so that the renderer can plot them one by one.
 */

/** Bresenham's line: visits every pixel from the first point to the last, both included. Coordinates must be integers. */
export function forEachLinePixel(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  visit: (x: number, y: number) => void,
): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const stepX = x0 < x1 ? 1 : -1;
  const stepY = y0 < y1 ? 1 : -1;
  // A counted loop rather than "until the end is reached", so that a NaN can never hang the frame.
  const pixels = Math.max(dx, -dy) + 1;
  let error = dx + dy;
  let x = x0;
  let y = y0;
  for (let i = 0; i < pixels; i++) {
    visit(x, y);
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += stepX;
    }
    if (doubled <= dx) {
      error += dx;
      y += stepY;
    }
  }
}

/** Offsets from the center of the pixels that make the outline of a circle (midpoint algorithm), each listed once. */
export function circleOutline(radius: number): Point[] {
  const found = new Map<string, Point>();
  const add = (x: number, y: number) => found.set(`${x},${y}`, { x, y });
  let x = radius;
  let y = 0;
  let error = 1 - radius;
  while (x >= y) {
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      add(sx * x, sy * y);
      add(sx * y, sy * x);
    }
    y++;
    if (error < 0) {
      error += 2 * y + 1;
    } else {
      x--;
      error += 2 * (y - x) + 1;
    }
  }
  return [...found.values()];
}

/** How far a disc of this radius reaches to each side of its center on the row `dy` away from it. */
export function discHalfWidth(radius: number, dy: number): number {
  return Math.floor(Math.sqrt(Math.max(0, radius * radius - dy * dy)));
}
