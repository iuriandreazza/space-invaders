import { cannonTip } from '../../../shared/game/geometry.ts';
import type { GameState, Point } from '../../../shared/game/types.ts';
import { COLORS } from './palette.ts';
import { forEachLinePixel } from './pixelGeometry.ts';

const FLICKER_TICKS = 2;
const GLOW_THICKNESS = 3;
const CORE_THICKNESS = 1;

function plotLine(ctx: CanvasRenderingContext2D, from: Point, to: Point, thickness: number): void {
  const reach = Math.floor(thickness / 2);
  forEachLinePixel(from.x, from.y, to.x, to.y, (x, y) => ctx.fillRect(x - reach, y - reach, thickness, thickness));
}

/** One beam from the tip of each cannon that still stands to the reticle: a dim glow and a hot core, flickering. */
export function drawBeams(ctx: CanvasRenderingContext2D, state: GameState): void {
  const tips = state.cannons.flatMap((cannon, index) => (cannon.hp > 0 ? [cannonTip(index)] : []));
  const target = { x: Math.round(state.aim.x), y: Math.round(state.aim.y) };
  const flicker = Math.floor(state.tick / FLICKER_TICKS) % 2;

  // All the glows go first: where the beams cross, a glow must not cover the core of the other beam.
  ctx.fillStyle = COLORS.beamGlow[flicker]!;
  for (const tip of tips) plotLine(ctx, tip, target, GLOW_THICKNESS);
  ctx.fillStyle = COLORS.beamCore[flicker]!;
  for (const tip of tips) plotLine(ctx, tip, target, CORE_THICKNESS);
}
