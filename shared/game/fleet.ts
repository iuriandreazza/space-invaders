import {
  FLEET_COLUMNS,
  FLEET_DROP_PX,
  FLEET_MAX_STEP_TICKS,
  FLEET_ROWS,
  FLEET_START_X,
  FLEET_STEP_PX,
  FLEET_TICKS_PER_INVADER,
  FLEET_WALL_MARGIN,
  INVADER_HP,
  ROW_KINDS,
  SCREEN_WIDTH,
} from './constants.ts';
import { difficultyFor } from './difficulty.ts';
import { aliveInvaders, invaderBox } from './geometry.ts';
import type { Fleet, Invader } from './types.ts';

/** Ticks until the next step: the fewer invaders are left, the faster they march. */
export function stepTicks(alive: number, scale: number): number {
  return Math.min(FLEET_MAX_STEP_TICKS, Math.max(1, Math.ceil(alive * FLEET_TICKS_PER_INVADER * scale)));
}

export function createFleet(wave: number): Fleet {
  const { fleetStartY, extraHp, stepTickScale } = difficultyFor(wave);
  const invaders: Invader[] = [];
  for (let row = 0; row < FLEET_ROWS; row++) {
    for (let col = 0; col < FLEET_COLUMNS; col++) {
      const kind = ROW_KINDS[row]!;
      invaders.push({ row, col, kind, hp: INVADER_HP[kind] + extraHp, alive: true });
    }
  }
  return {
    x: FLEET_START_X,
    y: fleetStartY,
    direction: 1,
    stepCountdown: stepTicks(invaders.length, stepTickScale),
    beat: 0,
    invaders,
  };
}

/** Moves the fleet one step: sideways, or down and around when the next step would touch a wall. There must be an invader alive. */
export function stepFleet(fleet: Fleet): void {
  let left = Infinity;
  let right = -Infinity;
  for (const invader of aliveInvaders(fleet)) {
    const box = invaderBox(fleet, invader);
    left = Math.min(left, box.x);
    right = Math.max(right, box.x + box.width);
  }
  const shift = fleet.direction * FLEET_STEP_PX;
  if (left + shift < FLEET_WALL_MARGIN || right + shift > SCREEN_WIDTH - FLEET_WALL_MARGIN) {
    fleet.y += FLEET_DROP_PX;
    fleet.direction = fleet.direction === 1 ? -1 : 1;
  } else {
    fleet.x += shift;
  }
  fleet.beat++;
}

export function countAlive(fleet: Fleet): number {
  let alive = 0;
  for (const invader of fleet.invaders) if (invader.alive) alive++;
  return alive;
}

/** The lowest edge reached by an invader that is still alive. */
export function fleetBottom(fleet: Fleet): number {
  let bottom = -Infinity;
  for (const invader of aliveInvaders(fleet)) {
    const box = invaderBox(fleet, invader);
    bottom = Math.max(bottom, box.y + box.height);
  }
  return bottom;
}
