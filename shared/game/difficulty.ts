import { EXTRA_HP_PER_WAVE, FLEET_START_Y, MAX_EXTRA_HP } from './constants.ts';

export interface Difficulty {
  /** Top of the fleet when the wave begins: later waves start closer to the bunkers. */
  fleetStartY: number;
  /** Multiplies the ticks between two steps of the fleet: below 1 is faster. */
  stepTickScale: number;
  /** Ticks between two bombs, at least. */
  bombInterval: number;
  maxBombs: number;
  /** Hit points added to every invader. */
  extraHp: number;
}

const FLEET_DESCENT_PER_WAVE = 8;
const MAX_FLEET_DESCENTS = 8;
const STEP_SPEED_UP_PER_WAVE = 0.07;
const MIN_STEP_TICK_SCALE = 0.35;
const FIRST_BOMB_INTERVAL = 60;
const BOMB_INTERVAL_DROP_PER_WAVE = 6;
const MIN_BOMB_INTERVAL = 24;
const FIRST_MAX_BOMBS = 4;
const MAX_BOMBS = 12;

/**
 * How hard a wave is. Only products and sums of small numbers, no `Math.pow`: ECMAScript leaves the last digits of
 * `pow` to the engine, and the server has to reach the very same game as the browser (see replay.ts).
 */
export function difficultyFor(wave: number): Difficulty {
  const later = Math.max(0, wave - 1);
  return {
    fleetStartY: FLEET_START_Y + FLEET_DESCENT_PER_WAVE * Math.min(later, MAX_FLEET_DESCENTS),
    stepTickScale: Math.max(MIN_STEP_TICK_SCALE, 1 - STEP_SPEED_UP_PER_WAVE * later),
    bombInterval: Math.max(MIN_BOMB_INTERVAL, FIRST_BOMB_INTERVAL - BOMB_INTERVAL_DROP_PER_WAVE * later),
    maxBombs: Math.min(MAX_BOMBS, FIRST_MAX_BOMBS + later),
    extraHp: Math.min(MAX_EXTRA_HP, EXTRA_HP_PER_WAVE * later),
  };
}
