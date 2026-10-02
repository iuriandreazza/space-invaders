import {
  AIM_START,
  BUNKER_SIZE,
  BUNKER_X,
  BUNKER_Y,
  CANNON_COUNT,
  CANNON_MAX_HP,
  ENERGY_MAX,
  FLEET_COLUMNS,
  FLEET_ROWS,
  FLEET_START_X,
  FLEET_START_Y,
  INVADER_HP,
  ROW_KINDS,
  WORLD_SEED,
} from '../../../shared/game/constants.ts';
import { createRandom } from '../../../shared/game/random.ts';
import type { Fleet, GameState, Invader } from '../../../shared/game/types.ts';

/** Test doubles for the adapters in this folder: states built by hand, and a canvas that only writes down what it is asked. */

function createInvaders(): Invader[] {
  return Array.from({ length: FLEET_ROWS * FLEET_COLUMNS }, (_, index) => {
    const row = Math.floor(index / FLEET_COLUMNS);
    const kind = ROW_KINDS[row]!;
    return { row, col: index % FLEET_COLUMNS, kind, hp: INVADER_HP[kind], alive: true };
  });
}

export function createTestFleet(): Fleet {
  return { x: FLEET_START_X, y: FLEET_START_Y, direction: 1, stepCountdown: 0, beat: 0, invaders: createInvaders() };
}

/** A fresh first wave in `playing`, with every part of it standing. */
export function createTestState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: 'playing',
    tick: 0,
    phaseTicks: 0,
    score: 0,
    wave: 1,
    waveBonus: 0,
    aim: { ...AIM_START },
    energy: ENERGY_MAX,
    overheated: false,
    firing: false,
    cannons: Array.from({ length: CANNON_COUNT }, () => ({ hp: CANNON_MAX_HP })),
    fleet: createTestFleet(),
    bombs: [],
    bombCountdown: 0,
    ufo: null,
    ufoCountdown: 0,
    ufoCount: 0,
    capsules: [],
    bunkers: BUNKER_X.map((x) => ({
      x,
      y: BUNKER_Y,
      pixels: new Uint8Array(BUNKER_SIZE.width * BUNKER_SIZE.height).fill(1),
    })),
    explosions: [],
    random: createRandom(WORLD_SEED),
    ...overrides,
  };
}

export interface RecordedRect {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface RecordedImage {
  image: unknown;
  x: number;
  y: number;
}

export interface RecordingContext {
  ctx: CanvasRenderingContext2D;
  rects: RecordedRect[];
  images: RecordedImage[];
}

export function createRecordingContext(): RecordingContext {
  const rects: RecordedRect[] = [];
  const images: RecordedImage[] = [];
  const fake = {
    fillStyle: '#000000',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    fillRect(x: number, y: number, width: number, height: number) {
      rects.push({ x, y, width, height, color: String(fake.fillStyle) });
    },
    drawImage(image: unknown, x: number, y: number) {
      images.push({ image, x, y });
    },
  };
  return { ctx: fake as unknown as CanvasRenderingContext2D, rects, images };
}

/** A canvas whose 2D context is the given one, for code that would otherwise need a browser. */
export function createFakeCanvas(context: RecordingContext = createRecordingContext()): HTMLCanvasElement {
  return { width: 0, height: 0, getContext: () => context.ctx } as unknown as HTMLCanvasElement;
}
