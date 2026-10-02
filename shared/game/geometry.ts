import {
  BOMB_SIZE,
  CANNON_SIZE,
  CANNON_TIP_OFFSET_X,
  CANNON_X,
  CANNON_Y,
  CAPSULE_SIZE,
  FLEET_CELL,
  INVADER_SIZE,
  UFO_SIZE,
} from './constants.ts';
import type { Bomb, Capsule, Fleet, Invader, Point, Rect, Ufo } from './types.ts';

/** Boxes and points of the things on the screen, in one place so that the engine and the renderer agree. */

/** The box of an invader: centered in its cell of the fleet's grid. */
export function invaderBox(fleet: Fleet, invader: Invader): Rect {
  const { width, height } = INVADER_SIZE[invader.kind];
  return {
    x: fleet.x + invader.col * FLEET_CELL.width + Math.floor((FLEET_CELL.width - width) / 2),
    y: fleet.y + invader.row * FLEET_CELL.height + Math.floor((FLEET_CELL.height - height) / 2),
    width,
    height,
  };
}

export function cannonBox(index: number): Rect {
  return { x: CANNON_X[index]!, y: CANNON_Y, ...CANNON_SIZE };
}

/** Where the laser of a cannon starts. */
export function cannonTip(index: number): Point {
  return { x: CANNON_X[index]! + CANNON_TIP_OFFSET_X, y: CANNON_Y };
}

export function bombBox(bomb: Bomb): Rect {
  return { x: bomb.x, y: bomb.y, ...BOMB_SIZE };
}

export function ufoBox(ufo: Ufo): Rect {
  return { x: ufo.x, y: ufo.y, ...UFO_SIZE };
}

export function capsuleBox(capsule: Capsule): Rect {
  return { x: capsule.x, y: capsule.y, ...CAPSULE_SIZE };
}

export function aliveInvaders(fleet: Fleet): Invader[] {
  return fleet.invaders.filter((invader) => invader.alive);
}
