import { describe, expect, it } from 'vitest';
import { drawHud, energyColor, formatScore, formatWave } from './hud.ts';
import { COLORS } from './palette.ts';
import { createRecordingContext, createTestState } from './testSupport.ts';

function paintedWith(color: string, state = createTestState()) {
  const { ctx, rects } = createRecordingContext();
  drawHud(ctx, state);
  return rects.filter((rect) => rect.color === color);
}

describe('formatScore', () => {
  it.each([
    [0, '000000'],
    [30, '000030'],
    [123_456, '123456'],
    [999_999, '999999'],
  ])('writes %i as %s', (score, text) => {
    expect(formatScore(score)).toBe(text);
  });

  it('stops at the highest score the screen has room for', () => {
    expect(formatScore(1_234_567)).toBe('999999');
  });

  it('never shows a negative or fractional score', () => {
    expect(formatScore(-5)).toBe('000000');
    expect(formatScore(41.9)).toBe('000041');
  });
});

describe('formatWave', () => {
  it.each([
    [1, '01'],
    [12, '12'],
    [100, '100'],
  ])('writes wave %i as %s', (wave, text) => {
    expect(formatWave(wave)).toBe(text);
  });
});

describe('energyColor', () => {
  it('goes from green to yellow to red as the energy runs out', () => {
    expect(energyColor(1)).toBe(COLORS.energyHigh);
    expect(energyColor(0.4)).toBe(COLORS.energyMedium);
    expect(energyColor(0.1)).toBe(COLORS.energyLow);
  });
});

describe('drawHud', () => {
  it('fills the bar in proportion to the energy', () => {
    const [full] = paintedWith(COLORS.energyHigh, createTestState({ energy: 1 }));
    const [low] = paintedWith(COLORS.energyLow, createTestState({ energy: 0.1 }));

    expect(full!.width).toBe(86);
    expect(low!.width).toBe(9);
    expect(full!.height).toBe(low!.height);
  });

  it('says OVERHEAT, and only then', () => {
    expect(paintedWith(COLORS.overheatText, createTestState({ overheated: false }))).toHaveLength(0);
    expect(paintedWith(COLORS.overheatText, createTestState({ overheated: true })).length).toBeGreaterThan(0);
  });

  it('blinks the bar red while overheated', () => {
    const bar = (tick: number) =>
      [COLORS.hudAlert, COLORS.hudAlertDark].map(
        (color) => paintedWith(color, createTestState({ overheated: true, tick })).length > 0,
      );

    expect(bar(0)).toEqual([true, false]);
    expect(bar(6)).toEqual([false, true]);
  });

  it('keeps the colors of the energy meter for when the lasers are on', () => {
    expect(paintedWith(COLORS.hudAlert, createTestState({ overheated: false }))).toHaveLength(0);
  });
});
