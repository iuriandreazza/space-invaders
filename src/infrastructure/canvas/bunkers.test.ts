import { describe, expect, it } from 'vitest';
import { BUNKER_SIZE } from '../../../shared/game/constants.ts';
import { drawBunkers, forEachStandingRun } from './bunkers.ts';
import { COLORS } from './palette.ts';
import { createRecordingContext, createTestState } from './testSupport.ts';

function runsOf(pixels: number[], width: number): Array<[number, number, number]> {
  const runs: Array<[number, number, number]> = [];
  forEachStandingRun(Uint8Array.from(pixels), width, (x, y, length) => runs.push([x, y, length]));
  return runs;
}

describe('forEachStandingRun', () => {
  it('finds nothing in a bunker that is gone', () => {
    expect(runsOf([0, 0, 0, 0], 2)).toEqual([]);
  });

  it('finds one run per row when the row is whole, edges included', () => {
    expect(runsOf([1, 1, 1, 1, 1, 1], 3)).toEqual([
      [0, 0, 3],
      [0, 1, 3],
    ]);
  });

  it('splits a row at every hole', () => {
    expect(runsOf([1, 0, 1, 1, 0, 1], 6)).toEqual([
      [0, 0, 1],
      [2, 0, 2],
      [5, 0, 1],
    ]);
  });

  it('does not let a run go on to the next row', () => {
    expect(runsOf([0, 1, 1, 0], 2)).toEqual([
      [1, 0, 1],
      [0, 1, 1],
    ]);
  });
});

describe('drawBunkers', () => {
  it('paints every standing pixel of every bunker, and nothing else', () => {
    const state = createTestState();
    state.bunkers[0]!.pixels[0] = 0;
    state.bunkers[0]!.pixels[1] = 0;
    const { ctx, rects } = createRecordingContext();

    drawBunkers(ctx, state.bunkers);

    const area = rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
    expect(area).toBe(state.bunkers.length * BUNKER_SIZE.width * BUNKER_SIZE.height - 2);
    expect(rects.every((rect) => rect.color === COLORS.bunker)).toBe(true);
  });
});
