import { BUNKER_COUNT, BUNKER_SIZE, BUNKER_X, BUNKER_Y } from './constants.ts';
import type { Bunker, Point, Rect } from './types.ts';

const { width: WIDTH, height: HEIGHT } = BUNKER_SIZE;

const CHAMFER_ROWS = 4;
const ARCH = { fromRow: 10, fromColumn: 8, toColumn: 15 } as const;

/** Pixels within this squared distance of an impact always go; up to the second one they go on a pseudo-random half. */
const CRATER_CORE = 6;
const CRATER_EDGE = 12;

/** The classic shield: a block with its top corners cut and an arch in the bottom middle. */
function standingPixels(): Uint8Array {
  const pixels = new Uint8Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    const inset = Math.max(0, CHAMFER_ROWS - y);
    for (let x = inset; x < WIDTH - inset; x++) {
      const inArch = y >= ARCH.fromRow && x >= ARCH.fromColumn && x <= ARCH.toColumn;
      if (!inArch) pixels[y * WIDTH + x] = 1;
    }
  }
  return pixels;
}

export function createBunkers(): Bunker[] {
  return Array.from({ length: BUNKER_COUNT }, (_, index) => ({
    x: BUNKER_X[index]!,
    y: BUNKER_Y,
    pixels: standingPixels(),
  }));
}

export function bunkerBox(bunker: Bunker): Rect {
  return { x: bunker.x, y: bunker.y, ...BUNKER_SIZE };
}

/** The pixel columns and rows of the bunker that a box covers, as inclusive ranges clipped to the bunker. */
function coveredRange(bunker: Bunker, box: Rect) {
  return {
    fromX: Math.max(0, Math.floor(box.x) - bunker.x),
    toX: Math.min(WIDTH - 1, Math.ceil(box.x + box.width) - 1 - bunker.x),
    fromY: Math.max(0, Math.floor(box.y) - bunker.y),
    toY: Math.min(HEIGHT - 1, Math.ceil(box.y + box.height) - 1 - bunker.y),
  };
}

/** Where a falling box first meets a standing pixel of the bunker, as pixel coordinates inside it; null if it does not. */
export function findImpact(bunker: Bunker, box: Rect): Point | null {
  const { fromX, toX, fromY, toY } = coveredRange(bunker, box);
  // From the bottom row up: a bomb comes from above, so its lowest pixels are the first to touch.
  for (let y = toY; y >= fromY; y--) {
    for (let x = fromX; x <= toX; x++) {
      if (bunker.pixels[y * WIDTH + x]) return { x, y };
    }
  }
  return null;
}

/** Eats away what a box covers, as an invader marching through does. Returns whether anything was left to eat. */
export function eraseUnder(bunker: Bunker, box: Rect): boolean {
  const { fromX, toX, fromY, toY } = coveredRange(bunker, box);
  let erased = false;
  for (let y = fromY; y <= toY; y++) {
    for (let x = fromX; x <= toX; x++) {
      if (bunker.pixels[y * WIDTH + x]) {
        bunker.pixels[y * WIDTH + x] = 0;
        erased = true;
      }
    }
  }
  return erased;
}

/** A hash of the position, so that the ragged edge of a crater is the same every time it is made. */
function isRaggedEdgePixel(x: number, y: number): boolean {
  return ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) & 1) === 0;
}

/** Blows a crater around a pixel of the bunker. */
export function carveCrater(bunker: Bunker, center: Point): void {
  for (let y = Math.max(0, center.y - 4); y <= Math.min(HEIGHT - 1, center.y + 4); y++) {
    for (let x = Math.max(0, center.x - 4); x <= Math.min(WIDTH - 1, center.x + 4); x++) {
      const dx = x - center.x;
      const dy = y - center.y;
      const distance = dx * dx + dy * dy;
      if (distance <= CRATER_CORE || (distance <= CRATER_EDGE && isRaggedEdgePixel(x, y))) {
        bunker.pixels[y * WIDTH + x] = 0;
      }
    }
  }
}
