import { AIM_BOUNDS } from '../../../shared/game/constants.ts';
import type { Input, Point } from '../../../shared/game/types.ts';

/**
 * How close, in game pixels, the reticle has to be to where the pointer is before it stops. The engine moves the reticle
 * in whole steps of AIM_SPEED, so a step that overshoots must still land inside the zone: otherwise the reticle would
 * jump back and forth over the pointer forever. That takes a zone at least half a step wide on each side.
 */
export const AIM_DEAD_ZONE = 2;

export type Steering = Pick<Input, 'left' | 'right' | 'up' | 'down'>;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/** The directions to hold so that the reticle goes to `target`, which the pointer may have left outside its reach. */
export function steerToward(aim: Readonly<Point>, target: Readonly<Point>): Steering {
  const dx = clamp(target.x, AIM_BOUNDS.minX, AIM_BOUNDS.maxX) - aim.x;
  const dy = clamp(target.y, AIM_BOUNDS.minY, AIM_BOUNDS.maxY) - aim.y;
  return {
    left: dx < -AIM_DEAD_ZONE,
    right: dx > AIM_DEAD_ZONE,
    up: dy < -AIM_DEAD_ZONE,
    down: dy > AIM_DEAD_ZONE,
  };
}
