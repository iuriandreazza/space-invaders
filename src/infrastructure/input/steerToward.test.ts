import { describe, expect, it } from 'vitest';
import { AIM_BOUNDS, AIM_SPEED } from '../../../shared/game/constants.ts';
import { advance, createGame } from '../../../shared/game/game.ts';
import type { Point } from '../../../shared/game/types.ts';
import { AIM_DEAD_ZONE, steerToward } from './steerToward.ts';

/** More ticks than the longest trip across the aim area, one step per tick, plus one for the last, short step. */
const MAX_TICKS_TO_ARRIVE = Math.ceil(Math.max(AIM_BOUNDS.maxX - AIM_BOUNDS.minX, AIM_BOUNDS.maxY - AIM_BOUNDS.minY) / AIM_SPEED) + 1;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const reachableGoal = (target: Point): Point => ({
  x: clamp(target.x, AIM_BOUNDS.minX, AIM_BOUNDS.maxX),
  y: clamp(target.y, AIM_BOUNDS.minY, AIM_BOUNDS.maxY),
});

/** Small seeded generator, so that a failing case can be played again. */
function randomNumbers(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const isIdle = (steering: ReturnType<typeof steerToward>): boolean => !Object.values(steering).some(Boolean);

/** Steers the real engine's reticle toward the target until `steerToward` lets go. */
function steerUntilIdle(start: Point, target: Point): { ticks: number; aim: Point; stepsAwayFromGoal: number } {
  const game = createGame();
  game.phase = 'playing';
  game.aim = { ...start };
  const goal = reachableGoal(target);
  let ticks = 0;
  let stepsAwayFromGoal = 0;

  for (; ticks <= MAX_TICKS_TO_ARRIVE * 2; ticks++) {
    const steering = steerToward(game.aim, target);
    if (isIdle(steering)) break;
    const before = { x: Math.abs(goal.x - game.aim.x), y: Math.abs(goal.y - game.aim.y) };
    advance(game, { ...steering, fire: false });
    const after = { x: Math.abs(goal.x - game.aim.x), y: Math.abs(goal.y - game.aim.y) };
    if (after.x > before.x || after.y > before.y) stepsAwayFromGoal++;
  }
  return { ticks, aim: { ...game.aim }, stepsAwayFromGoal };
}

function cases(): Array<{ start: Point; target: Point }> {
  const random = randomNumbers(2017);
  const between = (min: number, max: number): number => min + random() * (max - min);
  const edges = [AIM_BOUNDS.minX, AIM_BOUNDS.maxX];
  const corners = edges.flatMap((x) => [AIM_BOUNDS.minY, AIM_BOUNDS.maxY].map((y) => ({ x, y })));

  const atRandom = Array.from({ length: 300 }, () => ({
    // Targets go well past the aim area, as a pointer does over the page; every coordinate may have a fraction.
    start: { x: between(AIM_BOUNDS.minX, AIM_BOUNDS.maxX), y: between(AIM_BOUNDS.minY, AIM_BOUNDS.maxY) },
    target: { x: between(-60, 300), y: between(-60, 380) },
  }));
  const cornerToCorner = corners.flatMap((start) =>
    [...corners, { x: 120, y: 160 }, { x: -50, y: 400 }].map((target) => ({ start, target })),
  );
  return [...atRandom, ...cornerToCorner];
}

describe('steerToward', () => {
  it('holds the directions that lead to the target', () => {
    expect(steerToward({ x: 100, y: 100 }, { x: 150, y: 60 })).toEqual({ left: false, right: true, up: true, down: false });
    expect(steerToward({ x: 100, y: 100 }, { x: 50, y: 160 })).toEqual({ left: true, right: false, up: false, down: true });
  });

  it('is at rest inside the dead zone and moves just outside it', () => {
    const rest = { left: false, right: false, up: false, down: false };
    expect(steerToward({ x: 100, y: 100 }, { x: 100 + AIM_DEAD_ZONE, y: 100 - AIM_DEAD_ZONE })).toEqual(rest);
    expect(steerToward({ x: 100, y: 100 }, { x: 100 + AIM_DEAD_ZONE + 0.1, y: 100 })).toMatchObject({ right: true });
  });

  it('aims at the nearest reachable point when the target is out of reach', () => {
    const corner = { x: AIM_BOUNDS.maxX, y: AIM_BOUNDS.maxY };
    expect(steerToward(corner, { x: 500, y: 900 })).toEqual({ left: false, right: false, up: false, down: false });
    expect(steerToward({ x: 100, y: 100 }, { x: 500, y: 900 })).toEqual({ left: false, right: true, up: false, down: true });
  });

  describe('with the engine moving the reticle', () => {
    it('fits a whole step inside the dead zone, which is what keeps it from oscillating', () => {
      expect(AIM_SPEED).toBeLessThanOrEqual(2 * AIM_DEAD_ZONE);
    });

    it('brings the reticle to the target without ever moving away from it, and then leaves it alone', () => {
      for (const { start, target } of cases()) {
        const { ticks, aim, stepsAwayFromGoal } = steerUntilIdle(start, target);
        const goal = reachableGoal(target);
        const label = JSON.stringify({ start, target });

        expect(ticks, label).toBeLessThanOrEqual(MAX_TICKS_TO_ARRIVE);
        expect(Math.abs(aim.x - goal.x), label).toBeLessThanOrEqual(AIM_DEAD_ZONE);
        expect(Math.abs(aim.y - goal.y), label).toBeLessThanOrEqual(AIM_DEAD_ZONE);
        expect(stepsAwayFromGoal, label).toBe(0);
        expect(isIdle(steerToward(aim, target)), label).toBe(true);
      }
    });
  });
});
