import { AIM_BOUNDS, AIM_SPEED, LASER_RADIUS } from '../constants.ts';
import { aliveInvaders, bombBox, capsuleBox, invaderBox, ufoBox } from '../geometry.ts';
import { advance, createGame } from '../game.ts';
import { MAX_REPLAY_TICKS, ReplayRecorder } from '../replay.ts';
import type { GameState, Input, Point, Rect } from '../types.ts';

/**
 * Same relation the pointer adapter relies on: the reticle moves `AIM_SPEED` per held direction, so a dead zone of
 * half a step plus one keeps it from swinging back and forth over its target.
 */
const DEAD_ZONE = 2;

/** Bombs this far down the screen are worth turning away from the invaders for. */
const BOMB_DANGER_Y = 150;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/** The directions that bring the reticle to a point, the way a mouse is turned into controls. */
export function steerTowards(aim: Point, target: Point): Pick<Input, 'left' | 'right' | 'up' | 'down'> {
  const dx = clamp(target.x, AIM_BOUNDS.minX, AIM_BOUNDS.maxX) - aim.x;
  const dy = clamp(target.y, AIM_BOUNDS.minY, AIM_BOUNDS.maxY) - aim.y;
  return { left: dx < -DEAD_ZONE, right: dx > DEAD_ZONE, up: dy < -DEAD_ZONE, down: dy > DEAD_ZONE };
}

const centerOf = (box: Rect): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

const distance = (a: Point, b: Point): number => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));

function nearestTo(aim: Point, points: Point[]): Point | null {
  return points.reduce<Point | null>(
    (best, point) => (best === null || distance(aim, point) < distance(aim, best) ? point : best),
    null,
  );
}

/** What a decent player goes for, in order: a capsule, the bomb about to land, the saucer, the lowest invaders. */
function chooseTarget(state: GameState): Point | null {
  const capsule = nearestTo(state.aim, state.capsules.map((candidate) => centerOf(capsuleBox(candidate))));
  if (capsule) return capsule;

  const lowestBomb = state.bombs
    .map((bomb) => centerOf(bombBox(bomb)))
    .reduce<Point | null>((best, center) => (best === null || center.y > best.y ? center : best), null);
  if (lowestBomb && lowestBomb.y > BOMB_DANGER_Y) return lowestBomb;

  if (state.ufo) return centerOf(ufoBox(state.ufo));

  const alive = aliveInvaders(state.fleet);
  const lowestRow = Math.max(-1, ...alive.map((invader) => invader.row));
  const lowest = alive.filter((invader) => invader.row === lowestRow);
  return nearestTo(state.aim, lowest.map((invader) => centerOf(invaderBox(state.fleet, invader))));
}

const HANDS_OFF: Readonly<Input> = { left: false, right: false, up: false, down: false, fire: false };

/** A player that aims at what matters, fires only while something is under the reticle, and lets the lasers cool. */
export function hunter(state: GameState): Input {
  const target = chooseTarget(state);
  if (target === null) return { ...HANDS_OFF };
  const onTarget = distance(state.aim, target) <= LASER_RADIUS - AIM_SPEED;
  return { ...steerTowards(state.aim, target), fire: onTarget && state.energy > 0.05 };
}

function createStream(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Jabs at the controls at random (but always the same random for the same seed) every few ticks. */
export function noisyPolicy(seed: number): (state: GameState, tick: number) => Input {
  const next = createStream(seed);
  let held: Input = { ...HANDS_OFF, fire: true };
  return (_state, tick) => {
    if (tick % 15 === 0) {
      held = { left: next() < 0.4, right: next() < 0.4, up: next() < 0.4, down: next() < 0.4, fire: next() < 0.7 };
    }
    return held;
  };
}

/** Moves the reticle over the screen the way a hand on a mouse does: to a spot, then another, holding the button most of the time. */
export function wanderer(seed: number): (state: GameState, tick: number) => Input {
  const next = createStream(seed);
  let target: Point = { x: 120, y: 150 };
  let fire = true;
  return (state, tick) => {
    if (tick % 20 === 0) {
      target = { x: AIM_BOUNDS.minX + next() * (AIM_BOUNDS.maxX - AIM_BOUNDS.minX), y: 40 + next() * 200 };
      fire = next() < 0.8;
    }
    return { ...steerTowards(state.aim, target), fire };
  };
}

export interface RecordedRun {
  replay: number[];
  score: number;
  ticks: number;
}

/** Plays a whole game the way the web client does, writing the controls down as it goes. */
export function recordRun(policy: (state: GameState, tick: number) => Input, maxTicks = MAX_REPLAY_TICKS): RecordedRun {
  const state = createGame();
  const recorder = new ReplayRecorder();
  let ticks = 0;
  while (state.phase !== 'gameOver' && ticks < maxTicks) {
    const input = policy(state, ticks);
    advance(state, input);
    recorder.record(input);
    ticks++;
  }
  return { replay: recorder.replay(), score: state.score, ticks };
}
