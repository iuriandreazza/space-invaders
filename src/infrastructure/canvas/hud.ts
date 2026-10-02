import { HUD_HEIGHT, MAX_DISPLAYED_SCORE, SCREEN_WIDTH } from '../../../shared/game/constants.ts';
import type { GameState } from '../../../shared/game/types.ts';
import { strokeBox } from './drawing.ts';
import { COLORS } from './palette.ts';
import { GLYPH_HEIGHT, drawCenteredText, drawText, measureText } from './pixelFont.ts';

const SCORE_DIGITS = 6;
const WAVE_DIGITS = 2;
const TEXT_MARGIN = 6;
const TEXT_Y = Math.floor((HUD_HEIGHT - GLYPH_HEIGHT) / 2);

const ENERGY_LABEL = 'ENERGY';
const LABEL_GAP = 4;
const BAR_WIDTH = 88;
const BAR_HEIGHT = 8;
const BAR_Y = Math.floor((HUD_HEIGHT - BAR_HEIGHT) / 2);
const METER_WIDTH = measureText(ENERGY_LABEL) + LABEL_GAP + BAR_WIDTH;
const HIGH_ENERGY = 0.5;
const MEDIUM_ENERGY = 0.25;
const OVERHEAT_BLINK_TICKS = 6;

export function formatScore(score: number): string {
  const shown = Math.min(Math.max(0, Math.floor(score)), MAX_DISPLAYED_SCORE);
  return String(shown).padStart(SCORE_DIGITS, '0');
}

export function formatWave(wave: number): string {
  return String(wave).padStart(WAVE_DIGITS, '0');
}

/** Green while there is plenty left, then yellow, then red: the player has to ease off the trigger. */
export function energyColor(energy: number): string {
  if (energy > HIGH_ENERGY) return COLORS.energyHigh;
  if (energy > MEDIUM_ENERGY) return COLORS.energyMedium;
  return COLORS.energyLow;
}

/** The strip the game keeps free at the top: score on the left, wave on the right, the laser energy in between. */
export function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = COLORS.space;
  ctx.fillRect(0, 0, SCREEN_WIDTH, HUD_HEIGHT);
  strokeBox(ctx, 0, 0, SCREEN_WIDTH, HUD_HEIGHT, COLORS.hudFrame);

  drawText(ctx, `SCORE ${formatScore(state.score)}`, TEXT_MARGIN, TEXT_Y, COLORS.hudText);
  const wave = `WAVE ${formatWave(state.wave)}`;
  drawText(ctx, wave, SCREEN_WIDTH - TEXT_MARGIN - measureText(wave), TEXT_Y, COLORS.hudText);
  drawEnergyMeter(ctx, state);
}

function drawEnergyMeter(ctx: CanvasRenderingContext2D, state: GameState): void {
  const labelX = Math.round((SCREEN_WIDTH - METER_WIDTH) / 2);
  drawText(ctx, ENERGY_LABEL, labelX, TEXT_Y, COLORS.hudText);

  const barX = labelX + measureText(ENERGY_LABEL) + LABEL_GAP;
  strokeBox(ctx, barX, BAR_Y, BAR_WIDTH, BAR_HEIGHT, COLORS.energyFrame);
  const innerX = barX + 1;
  const innerY = BAR_Y + 1;
  const innerWidth = BAR_WIDTH - 2;
  const innerHeight = BAR_HEIGHT - 2;
  ctx.fillStyle = COLORS.energyTrack;
  ctx.fillRect(innerX, innerY, innerWidth, innerHeight);

  const filled = Math.round(Math.min(Math.max(state.energy, 0), 1) * innerWidth);
  ctx.fillStyle = state.overheated ? overheatColor(state.tick) : energyColor(state.energy);
  ctx.fillRect(innerX, innerY, filled, innerHeight);

  if (state.overheated) drawCenteredText(ctx, 'OVERHEAT', barX + BAR_WIDTH / 2, TEXT_Y, COLORS.overheatText);
}

function overheatColor(tick: number): string {
  return Math.floor(tick / OVERHEAT_BLINK_TICKS) % 2 === 0 ? COLORS.hudAlert : COLORS.hudAlertDark;
}
