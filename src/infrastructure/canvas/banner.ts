import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../../shared/game/constants.ts';
import type { GameState } from '../../../shared/game/types.ts';
import { COLORS } from './palette.ts';
import { GLYPH_HEIGHT, drawCenteredText } from './pixelFont.ts';

export interface BannerLine {
  text: string;
  scale: number;
  color: string;
}

const CENTER_Y = SCREEN_HEIGHT / 2 - 10;
const LINE_GAP = 6;
const PANEL_PADDING = 8;
const NO_BANNER: readonly BannerLine[] = [];

/** What the center of the screen says in each phase; `playing` and `dying` leave it to the action. */
export function bannerLines(state: GameState): readonly BannerLine[] {
  switch (state.phase) {
    case 'intro':
      return [
        { text: `WAVE ${state.wave}`, scale: 3, color: COLORS.bannerTitle },
        { text: 'GET READY', scale: 2, color: COLORS.bannerSubtitle },
      ];
    case 'cleared':
      return [
        { text: 'WAVE CLEARED', scale: 2, color: COLORS.bannerTitle },
        { text: `BONUS +${state.waveBonus}`, scale: 2, color: COLORS.bannerSubtitle },
      ];
    case 'gameOver':
      return [{ text: 'GAME OVER', scale: 3, color: COLORS.bannerAlert }];
    case 'playing':
    case 'dying':
      return NO_BANNER;
  }
}

/** Text on a dark band across the screen, so that it can be read over the fleet. */
export function drawBanner(ctx: CanvasRenderingContext2D, state: GameState): void {
  const lines = bannerLines(state);
  if (lines.length === 0) return;

  const textHeight = lines.reduce((sum, line) => sum + GLYPH_HEIGHT * line.scale, 0) + LINE_GAP * (lines.length - 1);
  const top = Math.round(CENTER_Y - textHeight / 2);
  ctx.fillStyle = COLORS.overlay;
  ctx.fillRect(0, top - PANEL_PADDING, SCREEN_WIDTH, textHeight + PANEL_PADDING * 2);

  let y = top;
  for (const line of lines) {
    drawCenteredText(ctx, line.text, SCREEN_WIDTH / 2, y, line.color, line.scale);
    y += GLYPH_HEIGHT * line.scale + LINE_GAP;
  }
}
