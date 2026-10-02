import { EXPLOSION_TICKS, SCREEN_HEIGHT, SCREEN_WIDTH } from '../../../shared/game/constants.ts';
import type { Explosion } from '../../../shared/game/types.ts';
import { fillDisc, fillRing } from './drawing.ts';
import { COLORS } from './palette.ts';

const FLICKER_TICKS = 2;

/** From the outermost layer to the core: how big each is next to the whole, and when, in progress, it goes out. */
const FIREBALL_LAYERS = [
  { size: 1, fadeAt: 0 },
  { size: 0.85, fadeAt: 0.15 },
  { size: 0.65, fadeAt: 0.3 },
  { size: 0.4, fadeAt: 0.5 },
  { size: 0.2, fadeAt: 0.7 },
] as const;

const RAY_DIRECTIONS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;
const BURST_FLASH_UNTIL = 0.35;
const BURST_REACH = { invader: 6, bomb: 3, ufo: 14 } as const;
const UFO_FIREBALL_RADIUS = 11;
const CANNON_FIREBALL_RADIUS = 16;

const NOVA_REACH = Math.hypot(SCREEN_WIDTH, SCREEN_HEIGHT);
const NOVA_RING_THICKNESS = 10;
const NOVA_EDGE_THICKNESS = 4;
const NOVA_FLASH_UNTIL = 0.2;
const NOVA_FLASH_ALPHA = 0.6;

/** Grows quickly, then goes out from the rim inwards: the bright core is the last layer to vanish. */
function drawFireball(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  progress: number,
  maxRadius: number,
  palette: readonly string[],
  flicker: number,
): void {
  const radius = maxRadius * Math.sin(Math.min(1, progress * 1.4) * (Math.PI / 2)) * (1 - progress * 0.35);
  FIREBALL_LAYERS.forEach((layer, index) => {
    if (progress > 0.6 + layer.fadeAt * 0.4) return;
    ctx.fillStyle = palette[index]!;
    fillDisc(ctx, centerX, centerY, radius * layer.size + (flicker % 2));
  });
}

/** Eight short rays flying outwards, like the classic invader explosion, and a flash at the start. */
function drawBurst(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  progress: number,
  reach: number,
  palette: readonly string[],
): void {
  ctx.fillStyle = palette[Math.min(palette.length - 1, Math.floor(progress * palette.length))]!;
  const distance = 2 + Math.round(progress * reach);
  for (const [dx, dy] of RAY_DIRECTIONS) {
    ctx.fillRect(centerX + dx * distance, centerY + dy * distance, 1, 1);
    ctx.fillRect(centerX + dx * (distance + 1), centerY + dy * (distance + 1), 1, 1);
  }
  if (progress < BURST_FLASH_UNTIL) ctx.fillRect(centerX - 1, centerY - 1, 3, 3);
}

/** A shock wave that grows until it has left the screen, behind a flash that lights the whole of it. */
function drawNova(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, progress: number): void {
  if (progress < NOVA_FLASH_UNTIL) {
    ctx.globalAlpha = NOVA_FLASH_ALPHA * (1 - progress / NOVA_FLASH_UNTIL);
    ctx.fillStyle = COLORS.novaFlash;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    ctx.globalAlpha = 1;
  }
  const radius = Math.round(progress * NOVA_REACH);
  ctx.fillStyle = COLORS.novaRing;
  fillRing(ctx, centerX, centerY, radius - NOVA_RING_THICKNESS, radius);
  ctx.fillStyle = COLORS.novaRingCore;
  fillRing(ctx, centerX, centerY, radius - NOVA_EDGE_THICKNESS, radius);
}

export function drawExplosion(ctx: CanvasRenderingContext2D, explosion: Explosion): void {
  const centerX = Math.round(explosion.x);
  const centerY = Math.round(explosion.y);
  const progress = Math.min(1, explosion.age / EXPLOSION_TICKS[explosion.kind]);
  const flicker = Math.floor(explosion.age / FLICKER_TICKS);

  switch (explosion.kind) {
    case 'invader':
      drawBurst(ctx, centerX, centerY, progress, BURST_REACH.invader, COLORS.burst);
      return;
    case 'bomb':
      drawBurst(ctx, centerX, centerY, progress, BURST_REACH.bomb, COLORS.bombBurst);
      return;
    case 'ufo':
      drawFireball(ctx, centerX, centerY, progress, UFO_FIREBALL_RADIUS, COLORS.magentaFire, flicker);
      drawBurst(ctx, centerX, centerY, progress, BURST_REACH.ufo, COLORS.ufoBurst);
      return;
    case 'cannon':
      drawFireball(ctx, centerX, centerY, progress, CANNON_FIREBALL_RADIUS, COLORS.orangeFire, flicker);
      return;
    case 'nova':
      drawNova(ctx, centerX, centerY, progress);
      return;
  }
}
