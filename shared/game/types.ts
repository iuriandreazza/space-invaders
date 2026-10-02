import type { InvaderKind } from './constants.ts';
import type { Random } from './random.ts';

/**
 * - `intro`: the fleet is on the screen and the wave is about to start.
 * - `playing`: the game proper.
 * - `cleared`: the last invader is gone and the wave bonus is on the screen.
 * - `dying`: the cannons are lost and are exploding.
 * - `gameOver`: the game is over; the engine ignores everything from here on.
 * The controls only count while `playing`.
 */
export type Phase = 'intro' | 'playing' | 'cleared' | 'dying' | 'gameOver';

/** What the player holds on a tick: the four directions steer the reticle, `fire` pulls the trigger. */
export interface Input {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
}

export const NO_INPUT: Readonly<Input> = { left: false, right: false, up: false, down: false, fire: false };

export interface Point {
  x: number;
  y: number;
}

/** Axis-aligned box; `x` and `y` are the top left corner. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Invader {
  row: number;
  col: number;
  kind: InvaderKind;
  /** Damage still needed to destroy it. */
  hp: number;
  alive: boolean;
}

export interface Fleet {
  /** Left edge of the grid; each invader sits in a cell of it. See `invaderBox`. */
  x: number;
  /** Top edge of the grid. */
  y: number;
  direction: -1 | 1;
  /** Ticks left until the next step. */
  stepCountdown: number;
  /** Counts the steps, so that the renderer can animate and the sound can march. */
  beat: number;
  invaders: Invader[];
}

export interface Cannon {
  /** 0 when the cannon is destroyed. */
  hp: number;
}

/** Falling at `(vx, vy)` pixels per tick; `x` and `y` are the top left corner and may be fractional. */
export interface Bomb {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Ufo {
  x: number;
  y: number;
  direction: -1 | 1;
  hp: number;
}

export type CapsuleKind = 'nova' | 'repair';

export interface Capsule {
  kind: CapsuleKind;
  x: number;
  y: number;
}

/** A shield made of pixels: `pixels[y * BUNKER_SIZE.width + x]` is 1 while that pixel stands. */
export interface Bunker {
  x: number;
  y: number;
  pixels: Uint8Array;
}

export type ExplosionKind = 'invader' | 'bomb' | 'cannon' | 'ufo' | 'nova';

export interface Explosion {
  kind: ExplosionKind;
  /** Center. */
  x: number;
  y: number;
  /** Ticks since it started. */
  age: number;
}

export type GameEvent =
  | { type: 'waveStarted'; wave: number }
  | { type: 'invaderDestroyed'; kind: InvaderKind; points: number }
  | { type: 'bombDestroyed' }
  | { type: 'bunkerHit' }
  | { type: 'cannonHit'; cannon: number }
  | { type: 'cannonDestroyed'; cannon: number }
  | { type: 'overheated' }
  | { type: 'ufoAppeared' }
  | { type: 'ufoDestroyed'; points: number }
  | { type: 'capsuleCollected'; kind: CapsuleKind }
  | { type: 'fleetStepped'; beat: number }
  | { type: 'waveCleared'; wave: number; bonus: number }
  | { type: 'gameOver' };

export interface GameState {
  phase: Phase;
  /** Ticks since the game began, in every phase. */
  tick: number;
  /** Ticks left in `intro`, `cleared` and `dying`. */
  phaseTicks: number;
  score: number;
  /** 1 for the first wave. */
  wave: number;
  /** Bonus given for the wave that was just cleared; it stays for the banner. */
  waveBonus: number;
  /** Center of the reticle. */
  aim: Point;
  /** 0 (empty) to 1 (full). */
  energy: number;
  /** The lasers are locked until the energy has recovered. */
  overheated: boolean;
  /** The lasers were on during the last tick. */
  firing: boolean;
  /** Left cannon first. */
  cannons: Cannon[];
  fleet: Fleet;
  bombs: Bomb[];
  /** Ticks left before the next bomb may be dropped. */
  bombCountdown: number;
  ufo: Ufo | null;
  ufoCountdown: number;
  /** Saucers seen so far; it picks the score of the next and the way it flies. */
  ufoCount: number;
  capsules: Capsule[];
  bunkers: Bunker[];
  explosions: Explosion[];
  random: Random;
}
