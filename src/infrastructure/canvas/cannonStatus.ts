import { CANNON_MAX_HP, SCREEN_WIDTH } from '../../../shared/game/constants.ts';
import { cannonBox } from '../../../shared/game/geometry.ts';
import type { Cannon } from '../../../shared/game/types.ts';
import { COLORS } from './palette.ts';
import { drawCenteredText } from './pixelFont.ts';

const PIP = { width: 3, height: 2, gap: 1 } as const;
const PIPS_WIDTH = CANNON_MAX_HP * PIP.width + (CANNON_MAX_HP - 1) * PIP.gap;
const PIPS_DISTANCE_BELOW_CANNON = 2;
const LABEL_Y = 310;

/** One pip per hit point under each cannon that still stands; a destroyed one is drawn as a wreck and needs none. */
export function drawCannonPips(ctx: CanvasRenderingContext2D, cannons: readonly Cannon[]): void {
  cannons.forEach((cannon, index) => {
    if (cannon.hp <= 0) return;
    const box = cannonBox(index);
    const left = box.x + Math.floor((box.width - PIPS_WIDTH) / 2);
    const top = box.y + box.height + PIPS_DISTANCE_BELOW_CANNON;
    for (let pip = 0; pip < CANNON_MAX_HP; pip++) {
      ctx.fillStyle = pip < cannon.hp ? COLORS.pipFull : COLORS.pipEmpty;
      ctx.fillRect(left + pip * (PIP.width + PIP.gap), top, PIP.width, PIP.height);
    }
  });
}

/** The reminder between the two cannons, as on the cabinet's floor. */
export function drawProtectLabel(ctx: CanvasRenderingContext2D): void {
  drawCenteredText(ctx, '◄ PROTECT ►', SCREEN_WIDTH / 2, LABEL_Y, COLORS.protectLabel);
}
