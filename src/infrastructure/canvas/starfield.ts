import { HUD_HEIGHT, SCREEN_HEIGHT, SCREEN_WIDTH } from '../../../shared/game/constants.ts';
import { combineSeeds } from '../../../shared/game/random.ts';
import { COLORS } from './palette.ts';

export interface Star {
  x: number;
  y: number;
  color: string;
  twinkles: boolean;
  /** Offsets the blinking so that the stars do not all go out together. */
  phase: number;
}

const STAR_COUNT = 56;
const TWINKLE_STEP_TICKS = 20;
/** A twinkling star is out for one step in this many. */
const TWINKLE_STEPS = 3;

function starColor(traits: number): string {
  if (traits % 8 === 0) return COLORS.starBright;
  if (traits % 3 === 0) return COLORS.starMid;
  return COLORS.starDim;
}

/** Every star comes from an integer hash of its index, so that the sky is the same in every run and on every machine. */
function starAt(index: number): Star {
  const traits = combineSeeds(index, 1);
  return {
    x: combineSeeds(index, 2) % SCREEN_WIDTH,
    y: HUD_HEIGHT + (combineSeeds(index, 3) % (SCREEN_HEIGHT - HUD_HEIGHT)),
    color: starColor(traits),
    twinkles: (traits >>> 8) % 4 === 0,
    phase: (traits >>> 16) % (TWINKLE_STEP_TICKS * TWINKLE_STEPS),
  };
}

export const STARS: readonly Star[] = Array.from({ length: STAR_COUNT }, (_, index) => starAt(index));

export function isStarLit(star: Star, tick: number): boolean {
  return !star.twinkles || Math.floor((tick + star.phase) / TWINKLE_STEP_TICKS) % TWINKLE_STEPS !== 0;
}

/** Paints over the previous frame: black space and its stars. */
export function drawBackground(ctx: CanvasRenderingContext2D, tick: number): void {
  ctx.fillStyle = COLORS.space;
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  for (const star of STARS) {
    if (!isStarLit(star, tick)) continue;
    ctx.fillStyle = star.color;
    ctx.fillRect(star.x, star.y, 1, 1);
  }
}
