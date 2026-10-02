import { describe, expect, it } from 'vitest';
import {
  FLEET_COLUMNS,
  FLEET_DROP_PX,
  FLEET_MAX_STEP_TICKS,
  FLEET_ROWS,
  FLEET_STEP_PX,
  FLEET_WALL_MARGIN,
  SCREEN_WIDTH,
} from './constants.ts';
import { countAlive, createFleet, fleetBottom, stepFleet, stepTicks } from './fleet.ts';
import { invaderBox } from './geometry.ts';

describe('createFleet', () => {
  it('fills the grid, row by row, with the kinds of the classic', () => {
    const fleet = createFleet(1);
    expect(fleet.invaders).toHaveLength(FLEET_ROWS * FLEET_COLUMNS);
    expect(fleet.invaders.slice(0, FLEET_COLUMNS).every((invader) => invader.kind === 'squid')).toBe(true);
    expect(fleet.invaders.at(-1)!.kind).toBe('octopus');
    expect(countAlive(fleet)).toBe(fleet.invaders.length);
  });

  it('starts inside the screen, with room on both sides', () => {
    const fleet = createFleet(1);
    const boxes = fleet.invaders.map((invader) => invaderBox(fleet, invader));
    expect(Math.min(...boxes.map((box) => box.x))).toBeGreaterThan(FLEET_WALL_MARGIN);
    expect(Math.max(...boxes.map((box) => box.x + box.width))).toBeLessThan(SCREEN_WIDTH - FLEET_WALL_MARGIN);
  });
});

describe('stepTicks', () => {
  it('shrinks with the number of invaders and stays within bounds', () => {
    let previous = Infinity;
    for (let alive = FLEET_ROWS * FLEET_COLUMNS; alive >= 1; alive--) {
      const ticks = stepTicks(alive, 1);
      expect(ticks).toBeLessThanOrEqual(previous);
      expect(ticks).toBeGreaterThanOrEqual(1);
      expect(ticks).toBeLessThanOrEqual(FLEET_MAX_STEP_TICKS);
      previous = ticks;
    }
    expect(stepTicks(1, 1)).toBe(1);
  });

  it('is shorter on a harder wave', () => {
    expect(stepTicks(40, 0.5)).toBeLessThan(stepTicks(40, 1));
  });
});

describe('stepFleet', () => {
  it('turns at the wall that the nearest invader reaches, not at the edge of the grid', () => {
    const fleet = createFleet(1);
    // Only the last column is left: the grid is far from the wall, the invader is not.
    fleet.invaders.forEach((invader) => (invader.alive = invader.col === FLEET_COLUMNS - 1));
    const lastColumn = fleet.invaders.filter((invader) => invader.alive).map((invader) => invaderBox(fleet, invader));
    const right = Math.max(...lastColumn.map((box) => box.x + box.width));
    fleet.x += SCREEN_WIDTH - FLEET_WALL_MARGIN - right - FLEET_STEP_PX + 1;
    const y = fleet.y;

    stepFleet(fleet);

    expect(fleet.y).toBe(y + FLEET_DROP_PX);
    expect(fleet.direction).toBe(-1);
  });

  it('counts its steps', () => {
    const fleet = createFleet(1);
    stepFleet(fleet);
    stepFleet(fleet);
    expect(fleet.beat).toBe(2);
  });
});

describe('fleetBottom', () => {
  it('follows the lowest invader that is alive', () => {
    const fleet = createFleet(1);
    const full = fleetBottom(fleet);
    fleet.invaders.forEach((invader) => (invader.alive = invader.row < FLEET_ROWS - 1));
    expect(fleetBottom(fleet)).toBeLessThan(full);
  });
});
