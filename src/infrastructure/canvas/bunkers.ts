import { BUNKER_SIZE } from '../../../shared/game/constants.ts';
import type { Bunker } from '../../../shared/game/types.ts';
import { COLORS } from './palette.ts';

/** Visits each horizontal run of standing pixels once, so that a bunker costs a few rectangles rather than a few hundred. */
export function forEachStandingRun(
  pixels: Uint8Array,
  width: number,
  visit: (x: number, y: number, length: number) => void,
): void {
  const height = pixels.length / width;
  for (let y = 0; y < height; y++) {
    let start = -1;
    // One step past the last column, so that a run touching the right edge is closed too.
    for (let x = 0; x <= width; x++) {
      const standing = x < width && pixels[y * width + x] === 1;
      if (standing && start < 0) {
        start = x;
      } else if (!standing && start >= 0) {
        visit(start, y, x - start);
        start = -1;
      }
    }
  }
}

export function drawBunkers(ctx: CanvasRenderingContext2D, bunkers: readonly Bunker[]): void {
  ctx.fillStyle = COLORS.bunker;
  for (const bunker of bunkers) {
    forEachStandingRun(bunker.pixels, BUNKER_SIZE.width, (x, y, length) => {
      ctx.fillRect(bunker.x + x, bunker.y + y, length, 1);
    });
  }
}
