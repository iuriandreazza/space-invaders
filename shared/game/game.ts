import { bunkerBox, carveCrater, createBunkers, eraseUnder, findImpact } from './bunkers.ts';
import { circleTouchesRect, rectsOverlap } from './collision.ts';
import {
  AIM_BOUNDS,
  AIM_SPEED,
  AIM_START,
  BOMB_AT_CANNON_PERCENT,
  BOMB_MAX_DRIFT,
  BOMB_SCATTER,
  BOMB_SIZE,
  BOMB_SPEED,
  BUNKER_COUNT,
  BUNKER_SIZE,
  CANNON_COUNT,
  CANNON_MAX_HP,
  CAPSULE_COLLECTABLE_Y,
  CAPSULE_SIZE,
  CAPSULE_SPEED,
  CLEARED_TICKS,
  DEATH_TICKS,
  ENERGY_DRAIN_PER_TICK,
  ENERGY_MAX,
  ENERGY_RECHARGE_PER_TICK,
  EXPLOSION_TICKS,
  INTRO_TICKS,
  INVASION_Y,
  LASER_DAMAGE_PER_CANNON,
  LASER_RADIUS,
  MAX_DISPLAYED_SCORE,
  MAX_WAVE_BONUS,
  NOVA_DAMAGE,
  OVERHEAT_RESUME_ENERGY,
  POINTS,
  REPAIR_HP,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  UFO_HP,
  UFO_INTERVAL,
  UFO_MIN_INVADERS,
  UFO_POINTS,
  UFO_SIZE,
  UFO_SPEED,
  UFO_Y,
  WAVE_BONUS_PER_WAVE,
  WAVE_REPAIR_HP,
  WORLD_SEED,
} from './constants.ts';
import { difficultyFor } from './difficulty.ts';
import { countAlive, createFleet, fleetBottom, stepFleet, stepTicks } from './fleet.ts';
import { aliveInvaders, bombBox, cannonBox, cannonTip, capsuleBox, invaderBox, ufoBox } from './geometry.ts';
import { createRandom, randomInt } from './random.ts';
import {
  NO_INPUT,
  type Bomb,
  type CapsuleKind,
  type ExplosionKind,
  type GameEvent,
  type GameState,
  type Input,
  type Invader,
  type Point,
  type Rect,
} from './types.ts';

export function createGame(): GameState {
  const { bombInterval } = difficultyFor(1);
  return {
    phase: 'intro',
    tick: 0,
    phaseTicks: INTRO_TICKS,
    score: 0,
    wave: 1,
    waveBonus: 0,
    aim: { ...AIM_START },
    energy: ENERGY_MAX,
    overheated: false,
    firing: false,
    cannons: Array.from({ length: CANNON_COUNT }, () => ({ hp: CANNON_MAX_HP })),
    fleet: createFleet(1),
    bombs: [],
    bombCountdown: bombInterval,
    ufo: null,
    ufoCountdown: UFO_INTERVAL,
    ufoCount: 0,
    capsules: [],
    bunkers: createBunkers(),
    explosions: [],
    random: createRandom(WORLD_SEED),
  };
}

/**
 * The controls the engine acts on in this state: whatever it ignores is cleared. Opposite directions cancel out, a
 * direction against the edge of the screen goes nowhere, the trigger does nothing while the lasers are locked, and
 * nothing counts outside the game proper. A replay is stored in this form, so that the same game has one spelling.
 */
export function effectiveInput(state: GameState, input: Input): Input {
  if (state.phase !== 'playing') return { ...NO_INPUT };
  const horizontal = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const vertical = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const { x, y } = state.aim;
  return {
    left: horizontal < 0 && x > AIM_BOUNDS.minX,
    right: horizontal > 0 && x < AIM_BOUNDS.maxX,
    up: vertical < 0 && y > AIM_BOUNDS.minY,
    down: vertical > 0 && y < AIM_BOUNDS.maxY,
    fire: input.fire && !state.overheated,
  };
}

/** Moves the game on by one tick (1/60 s) and returns what happened, for the sound. The controls are those held during the tick. */
export function advance(state: GameState, input: Input): GameEvent[] {
  const events: GameEvent[] = [];
  state.tick++;
  switch (state.phase) {
    case 'intro':
      tickIntro(state, events);
      break;
    case 'playing':
      tickPlaying(state, input, events);
      break;
    case 'cleared':
      tickCleared(state);
      break;
    case 'dying':
      tickDying(state, events);
      break;
    case 'gameOver':
      break;
  }
  ageExplosions(state);
  return events;
}

// Phases

function tickIntro(state: GameState, events: GameEvent[]): void {
  if (--state.phaseTicks > 0) return;
  state.phase = 'playing';
  events.push({ type: 'waveStarted', wave: state.wave });
}

function tickCleared(state: GameState): void {
  if (--state.phaseTicks > 0) return;
  startNextWave(state);
}

function tickDying(state: GameState, events: GameEvent[]): void {
  if (--state.phaseTicks > 0) return;
  state.phase = 'gameOver';
  events.push({ type: 'gameOver' });
}

function tickPlaying(state: GameState, input: Input, events: GameEvent[]): void {
  steerAim(state, input);
  updateLasers(state, input.fire, events);
  if (state.firing) burn(state, events);

  moveBombs(state, events);
  if (state.phase !== 'playing') return;
  dropBomb(state);
  stepFleetWhenDue(state, events);
  if (state.phase !== 'playing') return;
  moveUfo(state, events);
  moveCapsules(state);

  if (countAlive(state.fleet) === 0) clearWave(state, events);
}

function startNextWave(state: GameState): void {
  const wave = state.wave + 1;
  state.wave = wave;
  state.fleet = createFleet(wave);
  state.bunkers = createBunkers();
  state.bombs = [];
  state.bombCountdown = difficultyFor(wave).bombInterval;
  state.ufo = null;
  state.ufoCountdown = UFO_INTERVAL;
  state.capsules = [];
  state.phase = 'intro';
  state.phaseTicks = INTRO_TICKS;
}

function clearWave(state: GameState, events: GameEvent[]): void {
  const bonus = Math.min(MAX_WAVE_BONUS, WAVE_BONUS_PER_WAVE * state.wave);
  addScore(state, bonus);
  state.waveBonus = bonus;
  repairCannons(state, WAVE_REPAIR_HP);
  state.energy = ENERGY_MAX;
  state.overheated = false;
  endPlayingPhase(state, 'cleared', CLEARED_TICKS);
  events.push({ type: 'waveCleared', wave: state.wave, bonus });
}

/** The cannons are gone, shot to pieces or overrun: what is left is the show. */
function loseGame(state: GameState, events: GameEvent[]): void {
  state.cannons.forEach((cannon, index) => {
    if (cannon.hp === 0) return;
    cannon.hp = 0;
    explodeCannon(state, index, events);
  });
  endPlayingPhase(state, 'dying', DEATH_TICKS);
}

/** Leaves the game proper: nothing flies on and the lasers go off. */
function endPlayingPhase(state: GameState, phase: 'cleared' | 'dying', ticks: number): void {
  state.firing = false;
  state.bombs = [];
  state.capsules = [];
  state.ufo = null;
  state.phase = phase;
  state.phaseTicks = ticks;
}

// Aim and lasers

function steerAim(state: GameState, input: Input): void {
  const horizontal = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const vertical = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  state.aim.x = clamp(state.aim.x + horizontal * AIM_SPEED, AIM_BOUNDS.minX, AIM_BOUNDS.maxX);
  state.aim.y = clamp(state.aim.y + vertical * AIM_SPEED, AIM_BOUNDS.minY, AIM_BOUNDS.maxY);
}

/** Pulling the trigger drains the energy; empty, the lasers lock until it has recovered some. Not firing, it recharges. */
function updateLasers(state: GameState, wantsToFire: boolean, events: GameEvent[]): void {
  if (state.overheated || !wantsToFire) {
    state.firing = false;
    state.energy = Math.min(ENERGY_MAX, state.energy + ENERGY_RECHARGE_PER_TICK);
    if (state.overheated && state.energy >= OVERHEAT_RESUME_ENERGY) state.overheated = false;
    return;
  }
  state.firing = true;
  state.energy = Math.max(0, state.energy - ENERGY_DRAIN_PER_TICK);
  if (state.energy === 0) {
    state.overheated = true;
    events.push({ type: 'overheated' });
  }
}

/** The lasers converge on the reticle: everything inside its circle burns, and a capsule there is collected. */
function burn(state: GameState, events: GameEvent[]): void {
  const damage = LASER_DAMAGE_PER_CANNON * state.cannons.filter((cannon) => cannon.hp > 0).length;
  const touched = (box: Rect): boolean => circleTouchesRect(state.aim, LASER_RADIUS, box);

  for (const invader of state.fleet.invaders) {
    if (invader.alive && touched(invaderBox(state.fleet, invader))) hurtInvader(state, invader, damage, events);
  }

  const { ufo } = state;
  if (ufo && touched(ufoBox(ufo))) {
    ufo.hp -= damage;
    if (ufo.hp <= 0) destroyUfo(state, events);
  }

  state.bombs = state.bombs.filter((bomb) => {
    if (!touched(bombBox(bomb))) return true;
    explode(state, 'bomb', bombCenter(bomb));
    events.push({ type: 'bombDestroyed' });
    return false;
  });

  const collected = state.capsules.filter((capsule) => capsule.y >= CAPSULE_COLLECTABLE_Y && touched(capsuleBox(capsule)));
  state.capsules = state.capsules.filter((capsule) => !collected.includes(capsule));
  for (const capsule of collected) collectCapsule(state, capsule.kind, events);
}

function hurtInvader(state: GameState, invader: Invader, damage: number, events: GameEvent[]): void {
  invader.hp -= damage;
  if (invader.hp > 0) return;
  invader.alive = false;
  const points = POINTS[invader.kind];
  addScore(state, points);
  const box = invaderBox(state.fleet, invader);
  explode(state, 'invader', { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  events.push({ type: 'invaderDestroyed', kind: invader.kind, points });
}

// Bombs

function moveBombs(state: GameState, events: GameEvent[]): void {
  const flying: Bomb[] = [];
  for (const bomb of state.bombs) {
    bomb.x += bomb.vx;
    bomb.y += bomb.vy;
    if (hitCannon(state, bomb, events) || hitBunker(state, bomb, events)) continue;
    if (bomb.y < SCREEN_HEIGHT) flying.push(bomb);
  }
  state.bombs = flying;
  if (state.cannons.every((cannon) => cannon.hp === 0)) loseGame(state, events);
}

function hitCannon(state: GameState, bomb: Bomb, events: GameEvent[]): boolean {
  const box = bombBox(bomb);
  const index = state.cannons.findIndex((cannon, i) => cannon.hp > 0 && rectsOverlap(box, cannonBox(i)));
  if (index < 0) return false;
  const cannon = state.cannons[index]!;
  cannon.hp--;
  explode(state, 'bomb', bombCenter(bomb));
  if (cannon.hp === 0) explodeCannon(state, index, events);
  else events.push({ type: 'cannonHit', cannon: index });
  return true;
}

function hitBunker(state: GameState, bomb: Bomb, events: GameEvent[]): boolean {
  const box = bombBox(bomb);
  for (const bunker of state.bunkers) {
    if (!rectsOverlap(box, bunkerBox(bunker))) continue;
    const impact = findImpact(bunker, box);
    if (!impact) continue;
    // One pixel lower than the contact, so that the crater bites into the shield rather than into the air above it.
    carveCrater(bunker, { x: impact.x, y: Math.min(BUNKER_SIZE.height - 1, impact.y + 1) });
    explode(state, 'bomb', bombCenter(bomb));
    events.push({ type: 'bunkerHit' });
    return true;
  }
  return false;
}

/** The lowest invader of a random column drops a bomb, at a cannon or a bunker, when it is time and there is room. */
function dropBomb(state: GameState): void {
  if (--state.bombCountdown > 0) return;
  const { bombInterval, maxBombs } = difficultyFor(state.wave);
  const { random } = state;
  state.bombCountdown = bombInterval + randomInt(random, 0, Math.floor(bombInterval / 2));
  if (state.bombs.length >= maxBombs) return;

  const shooters = lowestInvaderOfEachColumn(state);
  if (shooters.length === 0) return;
  const shooter = invaderBox(state.fleet, shooters[randomInt(random, 0, shooters.length - 1)]!);
  const x = shooter.x + Math.floor(shooter.width / 2) - Math.floor(BOMB_SIZE.width / 2);
  const y = shooter.y + shooter.height;

  const target = pickBombTarget(state);
  const toTarget = target.y - y;
  const drift = toTarget > 0 ? ((target.x - x - BOMB_SIZE.width / 2) * BOMB_SPEED) / toTarget : 0;
  state.bombs.push({ x, y, vx: clamp(drift, -BOMB_MAX_DRIFT, BOMB_MAX_DRIFT), vy: BOMB_SPEED });
}

function lowestInvaderOfEachColumn(state: GameState): Invader[] {
  const lowest = new Map<number, Invader>();
  for (const invader of aliveInvaders(state.fleet)) {
    const known = lowest.get(invader.col);
    if (!known || invader.row > known.row) lowest.set(invader.col, invader);
  }
  return [...lowest.values()];
}

function pickBombTarget(state: GameState): Point {
  const { random } = state;
  const standing = state.cannons.flatMap((cannon, index) => (cannon.hp > 0 ? [index] : []));
  const atCannon = standing.length > 0 && randomInt(random, 0, 99) < BOMB_AT_CANNON_PERCENT;
  let target: Point;
  if (atCannon) {
    target = cannonTip(standing[randomInt(random, 0, standing.length - 1)]!);
  } else {
    const bunker = state.bunkers[randomInt(random, 0, BUNKER_COUNT - 1)]!;
    target = { x: bunker.x + BUNKER_SIZE.width / 2, y: bunker.y };
  }
  return { x: target.x + randomInt(random, -BOMB_SCATTER, BOMB_SCATTER), y: target.y };
}

// Fleet

function stepFleetWhenDue(state: GameState, events: GameEvent[]): void {
  const { fleet } = state;
  if (--fleet.stepCountdown > 0) return;

  stepFleet(fleet);
  events.push({ type: 'fleetStepped', beat: fleet.beat });
  trampleBunkers(state);
  fleet.stepCountdown = stepTicks(countAlive(fleet), difficultyFor(state.wave).stepTickScale);

  if (fleetBottom(fleet) >= INVASION_Y) loseGame(state, events);
}

/** Invaders that march through a shield eat it. */
function trampleBunkers(state: GameState): void {
  for (const invader of aliveInvaders(state.fleet)) {
    const box = invaderBox(state.fleet, invader);
    for (const bunker of state.bunkers) {
      if (rectsOverlap(box, bunkerBox(bunker))) eraseUnder(bunker, box);
    }
  }
}

// Saucer and capsules

function moveUfo(state: GameState, events: GameEvent[]): void {
  const { ufo } = state;
  if (ufo) {
    ufo.x += ufo.direction * UFO_SPEED;
    if (ufo.x > SCREEN_WIDTH || ufo.x < -UFO_SIZE.width) {
      state.ufo = null;
      state.ufoCountdown = UFO_INTERVAL;
    }
    return;
  }
  state.ufoCountdown = Math.max(0, state.ufoCountdown - 1);
  if (state.ufoCountdown > 0 || countAlive(state.fleet) < UFO_MIN_INVADERS) return;
  const direction = state.ufoCount % 2 === 0 ? 1 : -1;
  state.ufo = { x: direction === 1 ? -UFO_SIZE.width : SCREEN_WIDTH, y: UFO_Y, direction, hp: UFO_HP };
  state.ufoCount++;
  events.push({ type: 'ufoAppeared' });
}

function destroyUfo(state: GameState, events: GameEvent[]): void {
  const ufo = state.ufo!;
  const points = UFO_POINTS[(state.ufoCount - 1) % UFO_POINTS.length]!;
  addScore(state, points);
  const center = { x: ufo.x + UFO_SIZE.width / 2, y: ufo.y + UFO_SIZE.height / 2 };
  explode(state, 'ufo', center);
  // Help where it is needed: a cannon that is hurt gets a repair capsule, otherwise a nova.
  const kind: CapsuleKind = state.cannons.some((cannon) => cannon.hp < CANNON_MAX_HP) ? 'repair' : 'nova';
  state.capsules.push({ kind, x: Math.round(center.x - CAPSULE_SIZE.width / 2), y: ufo.y });
  state.ufo = null;
  state.ufoCountdown = UFO_INTERVAL;
  events.push({ type: 'ufoDestroyed', points });
}

function moveCapsules(state: GameState): void {
  for (const capsule of state.capsules) capsule.y += CAPSULE_SPEED;
  state.capsules = state.capsules.filter((capsule) => capsule.y < SCREEN_HEIGHT);
}

function collectCapsule(state: GameState, kind: CapsuleKind, events: GameEvent[]): void {
  events.push({ type: 'capsuleCollected', kind });
  if (kind === 'repair') {
    repairCannons(state, REPAIR_HP);
    return;
  }
  explode(state, 'nova', { x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 });
  for (const invader of state.fleet.invaders) {
    if (invader.alive) hurtInvader(state, invader, NOVA_DAMAGE, events);
  }
  if (state.bombs.length > 0) {
    state.bombs = [];
    events.push({ type: 'bombDestroyed' });
  }
}

// Shared

function repairCannons(state: GameState, hp: number): void {
  for (const cannon of state.cannons) cannon.hp = Math.min(CANNON_MAX_HP, cannon.hp + hp);
}

function explodeCannon(state: GameState, index: number, events: GameEvent[]): void {
  const box = cannonBox(index);
  explode(state, 'cannon', { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  events.push({ type: 'cannonDestroyed', cannon: index });
}

function explode(state: GameState, kind: ExplosionKind, center: Point): void {
  state.explosions.push({ kind, x: center.x, y: center.y, age: 0 });
}

function ageExplosions(state: GameState): void {
  if (state.explosions.length === 0) return;
  for (const explosion of state.explosions) explosion.age++;
  state.explosions = state.explosions.filter((explosion) => explosion.age < EXPLOSION_TICKS[explosion.kind]);
}

function addScore(state: GameState, points: number): void {
  state.score = Math.min(MAX_DISPLAYED_SCORE, state.score + points);
}

function bombCenter(bomb: Bomb): Point {
  return { x: bomb.x + BOMB_SIZE.width / 2, y: bomb.y + BOMB_SIZE.height / 2 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
