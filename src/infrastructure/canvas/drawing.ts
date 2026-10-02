import { SCREEN_HEIGHT } from '../../../shared/game/constants.ts';
import { discHalfWidth } from './pixelGeometry.ts';

/** Shapes made of horizontal runs of whole pixels: cheap, and they keep the blocky look. */

export function fillDisc(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number): void {
  const reach = Math.max(0, Math.round(radius));
  for (let dy = -reach; dy <= reach; dy++) {
    const half = discHalfWidth(reach, dy);
    ctx.fillRect(centerX - half, centerY + dy, half * 2 + 1, 1);
  }
}

/** The pixels farther than `innerRadius` and no farther than `outerRadius`; rows off the screen are skipped. */
export function fillRing(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
): void {
  if (innerRadius <= 0) {
    fillDisc(ctx, centerX, centerY, outerRadius);
    return;
  }
  const first = Math.max(-outerRadius, -centerY);
  const last = Math.min(outerRadius, SCREEN_HEIGHT - 1 - centerY);
  for (let dy = first; dy <= last; dy++) {
    const outer = discHalfWidth(outerRadius, dy);
    if (Math.abs(dy) > innerRadius) {
      ctx.fillRect(centerX - outer, centerY + dy, outer * 2 + 1, 1);
      continue;
    }
    const inner = discHalfWidth(innerRadius, dy);
    ctx.fillRect(centerX - outer, centerY + dy, outer - inner, 1);
    ctx.fillRect(centerX + inner + 1, centerY + dy, outer - inner, 1);
  }
}

/** A one pixel frame. */
export function strokeBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, 1);
  ctx.fillRect(x, y + height - 1, width, 1);
  ctx.fillRect(x, y + 1, 1, height - 2);
  ctx.fillRect(x + width - 1, y + 1, 1, height - 2);
}
