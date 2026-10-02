import { describe, expect, it } from 'vitest';
import {
  AIM_BOUNDS,
  CANNON_COUNT,
  EXPLOSION_TICKS,
  FLEET_COLUMNS,
  FLEET_ROWS,
  LASER_RADIUS,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
} from '../../../shared/game/constants.ts';
import { cannonTip } from '../../../shared/game/geometry.ts';
import type { ExplosionKind, GameState, Phase } from '../../../shared/game/types.ts';
import { CanvasRenderer } from './canvasRenderer.ts';
import { COLORS } from './palette.ts';
import { SpriteAtlas } from './spriteAtlas.ts';
import { SPRITES, type SpriteDefinition } from './spriteDefinitions.ts';
import {
  createFakeCanvas,
  createRecordingContext,
  createTestState,
  type RecordedRect,
  type RecordingContext,
} from './testSupport.ts';

const PHASES: Phase[] = ['intro', 'playing', 'cleared', 'dying', 'gameOver'];
const EXPLOSION_KINDS = Object.keys(EXPLOSION_TICKS) as ExplosionKind[];
const FIXED_SPRITES_ON_SCREEN = FLEET_COLUMNS * FLEET_ROWS + CANNON_COUNT;

interface Frame extends RecordingContext {
  atlas: SpriteAtlas;
}

function renderFrame(state: GameState): Frame {
  const screen = createRecordingContext();
  const atlas = new SpriteAtlas(() => createFakeCanvas());
  new CanvasRenderer(createFakeCanvas(screen), atlas).render(state);
  return { ...screen, atlas };
}

function rectsPainted(rects: RecordedRect[], colors: readonly string[]): RecordedRect[] {
  return rects.filter((rect) => colors.includes(rect.color));
}

describe('CanvasRenderer', () => {
  it('sizes the canvas to the logical screen and turns smoothing off, so that the pixels stay sharp', () => {
    const screen = createRecordingContext();
    const canvas = createFakeCanvas(screen);

    new CanvasRenderer(canvas, new SpriteAtlas(() => createFakeCanvas()));

    expect(canvas.width).toBe(SCREEN_WIDTH);
    expect(canvas.height).toBe(SCREEN_HEIGHT);
    expect(screen.ctx.imageSmoothingEnabled).toBe(false);
  });

  it('starts every frame by painting the whole screen black', () => {
    const { rects } = renderFrame(createTestState());

    expect(rects[0]).toEqual({ x: 0, y: 0, width: SCREEN_WIDTH, height: SCREEN_HEIGHT, color: COLORS.space });
  });

  it('blits the fleet, the cannons and the reticle, and whatever else is flying', () => {
    const plain = renderFrame(createTestState());
    const busy = renderFrame(
      createTestState({
        ufo: { x: 50, y: 26, direction: 1, hp: 80 },
        bombs: [{ x: 60, y: 120, vx: 0, vy: 2 }],
        capsules: [{ kind: 'nova', x: 100, y: 100 }],
      }),
    );

    expect(plain.images).toHaveLength(FIXED_SPRITES_ON_SCREEN + 1);
    expect(busy.images).toHaveLength(FIXED_SPRITES_ON_SCREEN + 1 + 3);
  });

  it('does not draw the invaders that are gone', () => {
    const state = createTestState();
    state.fleet.invaders[0]!.alive = false;
    state.fleet.invaders[1]!.alive = false;

    expect(renderFrame(state).images).toHaveLength(FIXED_SPRITES_ON_SCREEN + 1 - 2);
  });

  it('swaps the frame of the invaders on every step of the fleet', () => {
    // Each frame gets its own atlas, so the frames drawn can only be told apart through the atlas that painted them.
    const squidFramesDrawn = (beat: number): boolean[] => {
      const state = createTestState();
      state.fleet.beat = beat;
      const { atlas, images } = renderFrame(state);
      return SPRITES.invaders.squid.map((frame) => images.some((image) => image.image === atlas.get(frame)));
    };

    expect(squidFramesDrawn(0)).toEqual([true, false]);
    expect(squidFramesDrawn(1)).toEqual([false, true]);
    expect(squidFramesDrawn(2)).toEqual([true, false]);
  });

  it('draws a wrecked cannon with its wreck sprite and no pips', () => {
    const state = createTestState({ cannons: [{ hp: 0 }, { hp: 2 }] });

    const { atlas, images, rects } = renderFrame(state);

    expect(images.filter((image) => image.image === atlas.get(SPRITES.cannonWreck))).toHaveLength(1);
    expect(images.filter((image) => image.image === atlas.get(SPRITES.cannon))).toHaveLength(1);
    expect(rectsPainted(rects, [COLORS.pipFull])).toHaveLength(2);
    expect(rectsPainted(rects, [COLORS.pipEmpty])).toHaveLength(1);
  });

  describe('lasers', () => {
    const BEAM_CORE = COLORS.beamCore;
    const aim = { x: 120, y: 190 };

    it('draws no beam while the trigger is released', () => {
      const { rects } = renderFrame(createTestState({ firing: false }));

      expect(rectsPainted(rects, BEAM_CORE)).toHaveLength(0);
    });

    it('draws a beam from the tip of each cannon to the reticle while firing', () => {
      const { rects } = renderFrame(createTestState({ firing: true, aim }));
      const core = rectsPainted(rects, BEAM_CORE);
      const startsAt = (tip: { x: number; y: number }) => core.some((rect) => rect.x === tip.x && rect.y === tip.y);

      expect(startsAt(cannonTip(0))).toBe(true);
      expect(startsAt(cannonTip(1))).toBe(true);
      expect(core.filter((rect) => rect.x === aim.x && rect.y === aim.y)).toHaveLength(2);
    });

    it('draws the beam of the cannons that still stand only', () => {
      const { rects } = renderFrame(createTestState({ firing: true, aim, cannons: [{ hp: 0 }, { hp: 1 }] }));
      const core = rectsPainted(rects, BEAM_CORE);

      expect(core.some((rect) => rect.x === cannonTip(0).x && rect.y === cannonTip(0).y)).toBe(false);
      expect(core.some((rect) => rect.x === cannonTip(1).x && rect.y === cannonTip(1).y)).toBe(true);
    });

    it('flickers between two colors as the ticks go by', () => {
      const colorAt = (tick: number) => rectsPainted(renderFrame(createTestState({ firing: true, tick })).rects, BEAM_CORE)[0]!.color;

      expect(colorAt(0)).not.toBe(colorAt(2));
      expect(colorAt(0)).toBe(colorAt(1));
    });
  });

  describe('reticle', () => {
    const reticleAt = (state: GameState, sprite: SpriteDefinition) => {
      const { atlas, images } = renderFrame(state);
      return images.filter((image) => image.image === atlas.get(sprite));
    };

    it('is centered on the aim', () => {
      const [drawn] = reticleAt(createTestState({ aim: { x: 100, y: 150 } }), SPRITES.reticle.idle);

      expect(drawn).toMatchObject({ x: 100 - LASER_RADIUS, y: 150 - LASER_RADIUS });
    });

    it('brightens while firing and dims while overheated', () => {
      expect(reticleAt(createTestState({ firing: true }), SPRITES.reticle.firing)).toHaveLength(1);
      expect(reticleAt(createTestState({ overheated: true }), SPRITES.reticle.overheated)).toHaveLength(1);
    });

    it.each<Phase>(['dying', 'gameOver'])('goes away in %s, when the cannons are lost', (phase) => {
      expect(reticleAt(createTestState({ phase }), SPRITES.reticle.idle)).toHaveLength(0);
    });

    it.each<Phase>(['intro', 'playing', 'cleared'])('stays in %s', (phase) => {
      expect(reticleAt(createTestState({ phase }), SPRITES.reticle.idle)).toHaveLength(1);
    });
  });

  describe('banners', () => {
    it.each<[Phase, boolean]>([
      ['intro', true],
      ['cleared', true],
      ['gameOver', true],
      ['playing', false],
      ['dying', false],
    ])('in %s the band behind the text is on the screen: %s', (phase, shown) => {
      const { rects } = renderFrame(createTestState({ phase }));

      expect(rectsPainted(rects, [COLORS.overlay]).length > 0).toBe(shown);
    });
  });

  describe('drawing calls', () => {
    /** The calls a canvas would draw something odd for: NaN or infinite coordinates, negative sizes, blits between pixels. */
    function oddCalls({ rects, images }: RecordingContext): string[] {
      const odd = rects
        .filter(({ x, y, width, height }) => ![x, y, width, height].every(Number.isFinite) || width < 0 || height < 0)
        .map(({ x, y, width, height }) => `fillRect(${x}, ${y}, ${width}, ${height})`);
      const betweenPixels = images
        .filter(({ x, y }) => !Number.isInteger(x) || !Number.isInteger(y))
        .map(({ x, y }) => `drawImage(${x}, ${y})`);
      return [...odd, ...betweenPixels];
    }

    it('are sound in every phase, with everything on the screen at once', () => {
      for (const phase of PHASES) {
        for (const tick of [0, 1, 7, 61, 1_000_001]) {
          const state = createTestState({
            phase,
            tick,
            firing: true,
            overheated: tick % 2 === 0,
            energy: (tick % 10) / 10,
            score: 123_456,
            waveBonus: 300,
            aim: { x: AIM_BOUNDS.minX, y: AIM_BOUNDS.minY },
            ufo: { x: 50, y: 26, direction: -1, hp: 80 },
            bombs: [{ x: 60.5, y: 120.25, vx: 0.5, vy: 2 }],
            capsules: [
              { kind: 'nova', x: 100, y: 100 },
              { kind: 'repair', x: 130, y: 100 },
            ],
          });

          expect(oddCalls(renderFrame(state)), `${phase} at tick ${tick}`).toEqual([]);
        }
      }
    });

    it.each(EXPLOSION_KINDS)('are sound for a %s explosion, from its first tick to its last', (kind) => {
      for (let age = 0; age <= EXPLOSION_TICKS[kind]; age++) {
        const state = createTestState({ explosions: [{ kind, x: 120.4, y: 160.6, age }] });

        expect(oddCalls(renderFrame(state)), `${kind} at age ${age}`).toEqual([]);
      }
    });

    it.each(EXPLOSION_KINDS)('paint something for a %s explosion that has just started', (kind) => {
      const without = renderFrame(createTestState());
      const withExplosion = renderFrame(createTestState({ explosions: [{ kind, x: 120, y: 160, age: 1 }] }));

      expect(withExplosion.rects.length).toBeGreaterThan(without.rects.length);
    });
  });
});
