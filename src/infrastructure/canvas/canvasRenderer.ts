import type { RendererPort } from '../../application/ports.ts';
import { LASER_RADIUS, SCREEN_HEIGHT, SCREEN_WIDTH } from '../../../shared/game/constants.ts';
import { aliveInvaders, bombBox, cannonBox, capsuleBox, invaderBox, ufoBox } from '../../../shared/game/geometry.ts';
import type { GameState } from '../../../shared/game/types.ts';
import { drawBanner } from './banner.ts';
import { drawBeams } from './beams.ts';
import { drawBunkers } from './bunkers.ts';
import { drawCannonPips, drawProtectLabel } from './cannonStatus.ts';
import { drawExplosion } from './explosions.ts';
import { drawHud } from './hud.ts';
import { SpriteAtlas } from './spriteAtlas.ts';
import { SPRITES, type SpriteDefinition } from './spriteDefinitions.ts';
import { drawBackground } from './starfield.ts';

/** How often, in ticks, the capsules swap between their dim and bright body and the bombs wiggle. */
const CAPSULE_PULSE_TICKS = 8;
const BOMB_WIGGLE_TICKS = 6;

/** Paints the game at its logical 240x320 resolution; CSS scales the canvas up. */
export class CanvasRenderer implements RendererPort {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sprites: SpriteAtlas;

  constructor(canvas: HTMLCanvasElement, sprites: SpriteAtlas = new SpriteAtlas()) {
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    // Resizing the canvas resets its state, so this has to come after.
    this.ctx.imageSmoothingEnabled = false;
    this.sprites = sprites;
  }

  /** Back to front: the lasers and the reticle go above the invaders, and the banners above everything. */
  render(state: GameState): void {
    drawBackground(this.ctx, state.tick);
    drawHud(this.ctx, state);
    drawBunkers(this.ctx, state.bunkers);
    this.drawInvaders(state);
    this.drawUfo(state);
    this.drawCapsules(state);
    this.drawBombs(state);
    this.drawCannons(state);
    drawCannonPips(this.ctx, state.cannons);
    drawProtectLabel(this.ctx);
    if (state.firing) drawBeams(this.ctx, state);
    this.drawReticle(state);
    for (const explosion of state.explosions) drawExplosion(this.ctx, explosion);
    drawBanner(this.ctx, state);
  }

  private drawInvaders(state: GameState): void {
    const frame = state.fleet.beat % 2;
    for (const invader of aliveInvaders(state.fleet)) {
      const box = invaderBox(state.fleet, invader);
      this.blit(SPRITES.invaders[invader.kind][frame]!, box.x, box.y);
    }
  }

  private drawUfo(state: GameState): void {
    if (!state.ufo) return;
    const box = ufoBox(state.ufo);
    this.blit(SPRITES.ufo, box.x, box.y);
  }

  private drawCapsules(state: GameState): void {
    const bright = Math.floor(state.tick / CAPSULE_PULSE_TICKS) % 2;
    for (const capsule of state.capsules) {
      const box = capsuleBox(capsule);
      this.blit(SPRITES.capsules[capsule.kind][bright]!, box.x, box.y);
    }
  }

  private drawBombs(state: GameState): void {
    const frame = Math.floor(state.tick / BOMB_WIGGLE_TICKS) % 2;
    for (const bomb of state.bombs) {
      const box = bombBox(bomb);
      this.blit(SPRITES.bombs[frame]!, box.x, box.y);
    }
  }

  private drawCannons(state: GameState): void {
    state.cannons.forEach((cannon, index) => {
      const box = cannonBox(index);
      this.blit(cannon.hp > 0 ? SPRITES.cannon : SPRITES.cannonWreck, box.x, box.y);
    });
  }

  /** With both cannons lost there is nothing left to aim, so the reticle goes with them. */
  private drawReticle(state: GameState): void {
    if (state.phase === 'dying' || state.phase === 'gameOver') return;
    this.blit(reticleSprite(state), state.aim.x - LASER_RADIUS, state.aim.y - LASER_RADIUS);
  }

  private blit(sprite: SpriteDefinition, x: number, y: number): void {
    this.ctx.drawImage(this.sprites.get(sprite), Math.round(x), Math.round(y));
  }
}

function reticleSprite(state: GameState): SpriteDefinition {
  if (state.overheated) return SPRITES.reticle.overheated;
  return state.firing ? SPRITES.reticle.firing : SPRITES.reticle.idle;
}
