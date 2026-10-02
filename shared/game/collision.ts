import type { Point, Rect } from './types.ts';

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Whether a circle touches a box. It compares squares, so there is no square root to differ between machines. */
export function circleTouchesRect(center: Point, radius: number, rect: Rect): boolean {
  const nearestX = Math.min(Math.max(center.x, rect.x), rect.x + rect.width);
  const nearestY = Math.min(Math.max(center.y, rect.y), rect.y + rect.height);
  const dx = center.x - nearestX;
  const dy = center.y - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}
