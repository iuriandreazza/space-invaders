import { describe, expect, it } from 'vitest';
import { HUD_HEIGHT, SCREEN_HEIGHT, SCREEN_WIDTH } from '../../../shared/game/constants.ts';
import { STARS, drawBackground, isStarLit } from './starfield.ts';
import { COLORS } from './palette.ts';
import { createRecordingContext } from './testSupport.ts';

describe('starfield', () => {
  it('keeps every star on the screen and out of the score strip', () => {
    for (const { x, y } of STARS) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(SCREEN_WIDTH);
      expect(y).toBeGreaterThanOrEqual(HUD_HEIGHT);
      expect(y).toBeLessThan(SCREEN_HEIGHT);
    }
  });

  it('spreads the stars over the whole screen', () => {
    const quadrants = new Set(STARS.map(({ x, y }) => `${x < SCREEN_WIDTH / 2}${y < (SCREEN_HEIGHT + HUD_HEIGHT) / 2}`));
    expect(quadrants.size).toBe(4);
    expect(new Set(STARS.map(({ x, y }) => `${x},${y}`)).size).toBeGreaterThan(STARS.length - 3);
  });

  it('has stars of several brightnesses', () => {
    expect(new Set(STARS.map((star) => star.color))).toEqual(
      new Set([COLORS.starDim, COLORS.starMid, COLORS.starBright]),
    );
  });

  it('keeps most stars steady and lets a few twinkle', () => {
    const twinkling = STARS.filter((star) => star.twinkles);
    expect(twinkling.length).toBeGreaterThan(0);
    expect(twinkling.length).toBeLessThan(STARS.length / 2);
  });

  it('puts the twinkling stars out for a while, and never the steady ones', () => {
    const ticks = Array.from({ length: 200 }, (_, tick) => tick);
    for (const star of STARS) {
      const lit = ticks.filter((tick) => isStarLit(star, tick)).length;
      if (star.twinkles) expect(lit).toBeLessThan(ticks.length);
      else expect(lit).toBe(ticks.length);
    }
  });

  it('paints the same sky on the same tick', () => {
    const paint = (tick: number) => {
      const { ctx, rects } = createRecordingContext();
      drawBackground(ctx, tick);
      return rects;
    };

    expect(paint(5)).toEqual(paint(5));
    expect(paint(0)[0]).toEqual({ x: 0, y: 0, width: SCREEN_WIDTH, height: SCREEN_HEIGHT, color: COLORS.space });
  });
});
