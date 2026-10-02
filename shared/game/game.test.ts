import { describe, expect, it } from 'vitest';
import {
  AIM_BOUNDS,
  AIM_SPEED,
  AIM_START,
  BOMB_SIZE,
  BUNKER_SIZE,
  CANNON_MAX_HP,
  CLEARED_TICKS,
  DEATH_TICKS,
  ENERGY_DRAIN_PER_TICK,
  ENERGY_MAX,
  FLEET_COLUMNS,
  FLEET_DROP_PX,
  FLEET_ROWS,
  FLEET_STEP_PX,
  INTRO_TICKS,
  INVADER_HP,
  INVASION_Y,
  LASER_DAMAGE_PER_CANNON,
  MAX_DISPLAYED_SCORE,
  NOVA_DAMAGE,
  OVERHEAT_RESUME_ENERGY,
  POINTS,
  REPAIR_HP,
  SCREEN_HEIGHT,
  UFO_HP,
  UFO_INTERVAL,
  UFO_POINTS,
  WAVE_BONUS_PER_WAVE,
} from './constants.ts';
import { difficultyFor } from './difficulty.ts';
import { advance, createGame, effectiveInput } from './game.ts';
import { aliveInvaders, cannonTip, invaderBox } from './geometry.ts';
import { NO_INPUT, type GameEvent, type GameState, type Input, type Invader } from './types.ts';

const input = (overrides: Partial<Input>): Input => ({ ...NO_INPUT, ...overrides });

/** A game past its intro, with nothing scheduled to happen by itself: each test switches on only what it looks at. */
function quietGame(): GameState {
  const state = createGame();
  for (let tick = 0; tick < INTRO_TICKS; tick++) advance(state, NO_INPUT);
  state.bombCountdown = Infinity;
  state.fleet.stepCountdown = Infinity;
  state.ufoCountdown = Infinity;
  return state;
}

function run(state: GameState, ticks: number, controls: Input = NO_INPUT): GameEvent[] {
  const events: GameEvent[] = [];
  for (let tick = 0; tick < ticks; tick++) events.push(...advance(state, controls));
  return events;
}

const eventTypes = (events: GameEvent[]): string[] => events.map((event) => event.type);

function invaderAt(state: GameState, row: number, col: number): Invader {
  return state.fleet.invaders.find((invader) => invader.row === row && invader.col === col)!;
}

function aimAt(state: GameState, invader: Invader): void {
  const box = invaderBox(state.fleet, invader);
  state.aim.x = box.x + box.width / 2;
  state.aim.y = box.y + box.height / 2;
}

/** Leaves a single invader, so that a wave neither clears nor speeds up unexpectedly. */
function keepOnly(state: GameState, ...kept: Invader[]): void {
  for (const invader of state.fleet.invaders) invader.alive = kept.includes(invader);
}

describe('a new game', () => {
  it('begins with a full fleet, four whole bunkers and both cannons standing', () => {
    const state = createGame();

    expect(state.phase).toBe('intro');
    expect(state.fleet.invaders).toHaveLength(FLEET_ROWS * FLEET_COLUMNS);
    expect(aliveInvaders(state.fleet)).toHaveLength(FLEET_ROWS * FLEET_COLUMNS);
    expect(state.bunkers).toHaveLength(4);
    expect(state.bunkers.every((bunker) => bunker.pixels.some(Boolean))).toBe(true);
    expect(state.cannons).toEqual([{ hp: CANNON_MAX_HP }, { hp: CANNON_MAX_HP }]);
    expect(state.aim).toEqual(AIM_START);
    expect(state.score).toBe(0);
  });

  it('starts playing once the intro is over, and says so', () => {
    const state = createGame();

    const events = run(state, INTRO_TICKS);

    expect(state.phase).toBe('playing');
    expect(events).toEqual([{ type: 'waveStarted', wave: 1 }]);
  });

  it('ignores the controls during the intro', () => {
    const state = createGame();
    run(state, INTRO_TICKS - 1, input({ left: true, up: true, fire: true }));
    expect(state.aim).toEqual(AIM_START);
    expect(state.energy).toBe(ENERGY_MAX);
  });
});

describe('the reticle', () => {
  it('moves a fixed step per held direction', () => {
    const state = quietGame();
    advance(state, input({ left: true, up: true }));
    expect(state.aim).toEqual({ x: AIM_START.x - AIM_SPEED, y: AIM_START.y - AIM_SPEED });
  });

  it('stays where it is when opposite directions are held', () => {
    const state = quietGame();
    advance(state, input({ left: true, right: true, up: true, down: true }));
    expect(state.aim).toEqual(AIM_START);
  });

  it('stops at the edges of the screen', () => {
    const state = quietGame();
    run(state, 200, input({ left: true, up: true }));
    expect(state.aim).toEqual({ x: AIM_BOUNDS.minX, y: AIM_BOUNDS.minY });

    run(state, 200, input({ right: true, down: true }));
    expect(state.aim).toEqual({ x: AIM_BOUNDS.maxX, y: AIM_BOUNDS.maxY });
  });
});

describe('the lasers', () => {
  it('drain the energy while the trigger is held and refill it when it is not', () => {
    const state = quietGame();
    state.aim.y = AIM_BOUNDS.maxY;
    advance(state, input({ fire: true }));
    expect(state.firing).toBe(true);
    expect(state.energy).toBeCloseTo(ENERGY_MAX - ENERGY_DRAIN_PER_TICK);

    advance(state, NO_INPUT);
    expect(state.firing).toBe(false);
    expect(state.energy).toBeGreaterThan(ENERGY_MAX - ENERGY_DRAIN_PER_TICK);
  });

  it('lock when the energy runs out, and come back once it has recovered some', () => {
    const state = quietGame();
    state.energy = ENERGY_DRAIN_PER_TICK / 2;

    expect(eventTypes(advance(state, input({ fire: true })))).toEqual(['overheated']);
    expect(state.overheated).toBe(true);

    advance(state, input({ fire: true }));
    expect(state.firing).toBe(false);

    while (state.overheated) advance(state, input({ fire: true }));
    expect(state.energy).toBeGreaterThanOrEqual(OVERHEAT_RESUME_ENERGY);
    advance(state, input({ fire: true }));
    expect(state.firing).toBe(true);
  });

  it('burn an invader under the reticle until it is destroyed, and score it', () => {
    const state = quietGame();
    const octopus = invaderAt(state, FLEET_ROWS - 1, 0);
    aimAt(state, octopus);
    const damage = LASER_DAMAGE_PER_CANNON * 2;

    advance(state, input({ fire: true }));
    expect(octopus.hp).toBe(INVADER_HP.octopus - damage);
    expect(octopus.alive).toBe(true);

    const events = run(state, Math.ceil(INVADER_HP.octopus / damage), input({ fire: true }));

    expect(octopus.alive).toBe(false);
    expect(state.score).toBe(POINTS.octopus);
    expect(events).toContainEqual({ type: 'invaderDestroyed', kind: 'octopus', points: POINTS.octopus });
    expect(state.explosions.some((explosion) => explosion.kind === 'invader')).toBe(true);
  });

  it('leave invaders alone that are outside the reticle', () => {
    const state = quietGame();
    const far = invaderAt(state, 0, 0);
    state.aim.x = AIM_BOUNDS.maxX;
    state.aim.y = AIM_BOUNDS.maxY;

    run(state, 10, input({ fire: true }));

    expect(far.hp).toBe(INVADER_HP.squid);
  });

  it('do half the damage with one cannon left', () => {
    const state = quietGame();
    state.cannons[0]!.hp = 0;
    const squid = invaderAt(state, 0, 5);
    aimAt(state, squid);

    advance(state, input({ fire: true }));

    expect(squid.hp).toBe(INVADER_HP.squid - LASER_DAMAGE_PER_CANNON);
  });
});

describe('effectiveInput', () => {
  it('leaves out what the engine would ignore', () => {
    const state = quietGame();
    expect(effectiveInput(state, input({ left: true, right: true, up: true, down: true, fire: true }))).toEqual(
      input({ fire: true }),
    );

    state.aim.x = AIM_BOUNDS.minX;
    expect(effectiveInput(state, input({ left: true }))).toEqual(NO_INPUT);

    state.overheated = true;
    expect(effectiveInput(state, input({ fire: true }))).toEqual(NO_INPUT);
  });

  it('counts nothing outside the game proper', () => {
    const state = createGame();
    expect(effectiveInput(state, input({ left: true, fire: true }))).toEqual(NO_INPUT);
  });
});

describe('bombs', () => {
  it('are dropped from the lowest invader of a column, and fall', () => {
    const state = quietGame();
    state.bombCountdown = 1;

    advance(state, NO_INPUT);

    expect(state.bombs).toHaveLength(1);
    const bomb = state.bombs[0]!;
    const shooters = state.fleet.invaders.filter((invader) => invader.row === FLEET_ROWS - 1).map((invader) => invaderBox(state.fleet, invader));
    expect(shooters.some((box) => box.y + box.height === bomb.y && bomb.x >= box.x && bomb.x <= box.x + box.width)).toBe(true);

    const before = bomb.y;
    advance(state, NO_INPUT);
    expect(bomb.y).toBeGreaterThan(before);
  });

  it('never outnumber what the wave allows', () => {
    const state = quietGame();
    state.bombCountdown = 1;
    for (let tick = 0; tick < 600; tick++) {
      state.bombCountdown = Math.min(state.bombCountdown, 1);
      advance(state, NO_INPUT);
      expect(state.bombs.length).toBeLessThanOrEqual(difficultyFor(1).maxBombs);
    }
  });

  it('are shot down by the lasers', () => {
    const state = quietGame();
    state.bombs.push({ x: 100, y: 200, vx: 0, vy: 2 });
    state.aim.x = 100 + BOMB_SIZE.width / 2;
    state.aim.y = 202;

    const events = advance(state, input({ fire: true }));

    expect(state.bombs).toHaveLength(0);
    expect(eventTypes(events)).toContain('bombDestroyed');
    expect(state.score).toBe(0);
  });

  it('hurt a cannon, and destroy it with the last hit point', () => {
    const state = quietGame();
    const tip = cannonTip(0);
    state.bombs.push({ x: tip.x, y: tip.y - 2, vx: 0, vy: 2 });

    const hit = advance(state, NO_INPUT);
    expect(state.cannons[0]!.hp).toBe(CANNON_MAX_HP - 1);
    expect(hit).toContainEqual({ type: 'cannonHit', cannon: 0 });
    expect(state.bombs).toHaveLength(0);

    state.cannons[0]!.hp = 1;
    state.bombs.push({ x: tip.x, y: tip.y - 2, vx: 0, vy: 2 });
    const destroyed = advance(state, NO_INPUT);
    expect(state.cannons[0]!.hp).toBe(0);
    expect(destroyed).toContainEqual({ type: 'cannonDestroyed', cannon: 0 });
    expect(state.phase).toBe('playing');
  });

  it('end the game when the last cannon goes, after the explosions', () => {
    const state = quietGame();
    state.cannons[0]!.hp = 0;
    state.cannons[1]!.hp = 1;
    const tip = cannonTip(1);
    state.bombs.push({ x: tip.x, y: tip.y - 2, vx: 0, vy: 2 });
    state.firing = true;

    advance(state, NO_INPUT);
    expect(state.phase).toBe('dying');
    expect(state.firing).toBe(false);

    const events = run(state, DEATH_TICKS);
    expect(state.phase).toBe('gameOver');
    expect(eventTypes(events)).toEqual(['gameOver']);
  });

  it('dig a crater in a bunker instead of reaching the ground', () => {
    const state = quietGame();
    const bunker = state.bunkers[1]!;
    const standing = () => bunker.pixels.reduce((sum, pixel) => sum + pixel, 0);
    const before = standing();
    state.bombs.push({ x: bunker.x + 4, y: bunker.y - BOMB_SIZE.height + 1, vx: 0, vy: 2 });

    const events = run(state, 3);

    expect(state.bombs).toHaveLength(0);
    expect(standing()).toBeLessThan(before);
    expect(eventTypes(events)).toContain('bunkerHit');
  });

  it('go on past a bunker that has a hole where they fall', () => {
    const state = quietGame();
    const bunker = state.bunkers[0]!;
    bunker.pixels.fill(0);
    state.bombs.push({ x: bunker.x + 4, y: bunker.y - 4, vx: 0, vy: 2 });

    run(state, 10);

    expect(state.bombs[0]!.y).toBeGreaterThan(bunker.y + BUNKER_SIZE.height - 4);
  });

  it('disappear below the screen', () => {
    const state = quietGame();
    state.bunkers.forEach((bunker) => bunker.pixels.fill(0));
    state.bombs.push({ x: 120, y: SCREEN_HEIGHT - 3, vx: 0, vy: 2 });

    run(state, 3);

    expect(state.bombs).toHaveLength(0);
  });

  it('can be aimed at a cannon, and do reach the corner', () => {
    const state = createGame();
    run(state, INTRO_TICKS);
    state.bunkers.forEach((bunker) => bunker.pixels.fill(0));
    state.fleet.stepCountdown = Infinity;
    state.ufoCountdown = Infinity;

    run(state, 60 * 60);

    expect(state.cannons.some((cannon) => cannon.hp < CANNON_MAX_HP)).toBe(true);
  });
});

describe('the fleet', () => {
  it('marches sideways, then down and back at the wall', () => {
    const state = quietGame();
    const startX = state.fleet.x;
    const startY = state.fleet.y;

    state.fleet.stepCountdown = 1;
    advance(state, NO_INPUT);
    expect(state.fleet.x).toBe(startX + FLEET_STEP_PX);
    expect(state.fleet.y).toBe(startY);

    state.fleet.x = 200;
    state.fleet.stepCountdown = 1;
    advance(state, NO_INPUT);
    expect(state.fleet.y).toBe(startY + FLEET_DROP_PX);
    expect(state.fleet.direction).toBe(-1);
    expect(state.fleet.x).toBe(200);
  });

  it('marches faster the fewer invaders are left', () => {
    const state = quietGame();
    state.fleet.stepCountdown = 1;
    advance(state, NO_INPUT);
    const crowded = state.fleet.stepCountdown;

    keepOnly(state, invaderAt(state, 0, 0));
    state.fleet.stepCountdown = 1;
    advance(state, NO_INPUT);

    expect(state.fleet.stepCountdown).toBeLessThan(crowded);
  });

  it('announces every step for the sound to keep time', () => {
    const state = quietGame();
    state.fleet.stepCountdown = 1;
    expect(advance(state, NO_INPUT)).toContainEqual({ type: 'fleetStepped', beat: 1 });
  });

  it('eats the bunkers it marches through', () => {
    const state = quietGame();
    const bunker = state.bunkers[0]!;
    state.fleet.y = bunker.y - 4;
    state.fleet.stepCountdown = 1;
    const before = bunker.pixels.reduce((sum, pixel) => sum + pixel, 0);

    advance(state, NO_INPUT);

    expect(bunker.pixels.reduce((sum, pixel) => sum + pixel, 0)).toBeLessThan(before);
  });

  it('lands: the cannons are lost when an invader gets too low', () => {
    const state = quietGame();
    state.fleet.y = INVASION_Y;
    state.fleet.stepCountdown = 1;

    const events = advance(state, NO_INPUT);

    expect(state.phase).toBe('dying');
    expect(state.cannons.map((cannon) => cannon.hp)).toEqual([0, 0]);
    expect(eventTypes(events)).toEqual(expect.arrayContaining(['cannonDestroyed', 'fleetStepped']));
  });
});

describe('the flying saucer', () => {
  it('appears after its interval, crossing from alternating sides, and leaves', () => {
    const state = quietGame();
    state.ufoCountdown = 1;

    expect(eventTypes(advance(state, NO_INPUT))).toContain('ufoAppeared');
    expect(state.ufo!.direction).toBe(1);
    expect(state.ufo!.x).toBeLessThan(0);

    run(state, 600);
    expect(state.ufo).toBeNull();
    expect(state.ufoCountdown).toBeGreaterThan(UFO_INTERVAL - 600);
  });

  it('does not appear when only a few invaders are left', () => {
    const state = quietGame();
    keepOnly(state, invaderAt(state, 0, 0));
    state.ufoCountdown = 1;

    advance(state, NO_INPUT);

    expect(state.ufo).toBeNull();
  });

  it('is worth the next points of a fixed table, and leaves a capsule', () => {
    const state = quietGame();
    state.ufoCountdown = 1;
    advance(state, NO_INPUT);
    // Alone, so that the reticle on the saucer does not burn the fleet below it.
    keepOnly(state, invaderAt(state, FLEET_ROWS - 1, FLEET_COLUMNS - 1));
    state.ufoCountdown = Infinity;

    const events: GameEvent[] = [];
    for (let tick = 0; tick < UFO_HP && state.ufo; tick++) {
      state.aim.x = state.ufo.x + 8;
      state.aim.y = state.ufo.y + 3;
      events.push(...advance(state, input({ fire: true })));
    }

    expect(state.ufo).toBeNull();
    expect(events).toContainEqual({ type: 'ufoDestroyed', points: UFO_POINTS[0] });
    expect(state.score).toBe(UFO_POINTS[0]);
    expect(state.capsules.map((capsule) => capsule.kind)).toEqual(['nova']);
  });

  it('leaves a repair capsule when a cannon is hurt', () => {
    const state = quietGame();
    state.cannons[1]!.hp = 1;
    state.ufoCountdown = 1;
    advance(state, NO_INPUT);
    keepOnly(state, invaderAt(state, FLEET_ROWS - 1, FLEET_COLUMNS - 1));
    state.ufo!.hp = 1;
    state.aim.x = state.ufo!.x + 8;
    state.aim.y = state.ufo!.y + 3;

    advance(state, input({ fire: true }));

    expect(state.capsules.map((capsule) => capsule.kind)).toEqual(['repair']);
  });
});

describe('capsules', () => {
  it('fall, and are lost at the bottom', () => {
    const state = quietGame();
    state.capsules.push({ kind: 'nova', x: 10, y: SCREEN_HEIGHT - 2 });
    run(state, 3);
    expect(state.capsules).toHaveLength(0);
  });

  it('repair give back hit points, and bring a lost cannon back, when the lasers touch them', () => {
    const state = quietGame();
    state.cannons[0]!.hp = 0;
    state.cannons[1]!.hp = 2;
    state.capsules.push({ kind: 'repair', x: 100, y: 200 });
    state.aim.x = 104;
    state.aim.y = 204;

    const events = advance(state, input({ fire: true }));

    expect(state.cannons.map((cannon) => cannon.hp)).toEqual([REPAIR_HP, CANNON_MAX_HP]);
    expect(events).toContainEqual({ type: 'capsuleCollected', kind: 'repair' });
    expect(state.capsules).toHaveLength(0);
  });

  it('cannot be picked up by the lasers that are still on the saucer that dropped them', () => {
    const state = quietGame();
    state.capsules.push({ kind: 'repair', x: 100, y: 30 });
    state.aim.x = 104;
    state.aim.y = 34;

    advance(state, input({ fire: true }));

    expect(state.capsules).toHaveLength(1);
  });

  it('do nothing while the lasers are off', () => {
    const state = quietGame();
    state.capsules.push({ kind: 'nova', x: 100, y: 200 });
    state.aim.x = 104;
    state.aim.y = 204;

    advance(state, NO_INPUT);

    expect(state.capsules).toHaveLength(1);
  });

  it('nova hurt every invader on the screen and sweep the bombs away', () => {
    const state = quietGame();
    state.bombs.push({ x: 50, y: 100, vx: 0, vy: 2 });
    state.capsules.push({ kind: 'nova', x: 100, y: 220 });
    state.aim.x = 104;
    state.aim.y = 224;

    advance(state, input({ fire: true }));

    expect(state.bombs).toHaveLength(0);
    expect(invaderAt(state, 0, 0).hp).toBe(INVADER_HP.squid - NOVA_DAMAGE);
    expect(invaderAt(state, FLEET_ROWS - 1, 0).alive).toBe(INVADER_HP.octopus > NOVA_DAMAGE);
    expect(state.explosions.some((explosion) => explosion.kind === 'nova')).toBe(true);
  });
});

describe('a wave', () => {
  function clearWithOneInvaderLeft(): { state: GameState; events: GameEvent[] } {
    const state = quietGame();
    state.cannons[0]!.hp = 1;
    state.cannons[1]!.hp = 0;
    state.energy = 0.5;
    const last = invaderAt(state, FLEET_ROWS - 1, 3);
    keepOnly(state, last);
    last.hp = 1;
    aimAt(state, last);
    const events = advance(state, input({ fire: true }));
    return { state, events };
  }

  it('is cleared with the last invader: bonus, repairs, a full tank', () => {
    const { state, events } = clearWithOneInvaderLeft();

    expect(state.phase).toBe('cleared');
    expect(events).toContainEqual({ type: 'waveCleared', wave: 1, bonus: WAVE_BONUS_PER_WAVE });
    expect(state.score).toBe(POINTS.octopus + WAVE_BONUS_PER_WAVE);
    expect(state.waveBonus).toBe(WAVE_BONUS_PER_WAVE);
    expect(state.cannons.map((cannon) => cannon.hp)).toEqual([2, 1]);
    expect(state.energy).toBe(ENERGY_MAX);
  });

  it('is followed by a harder one, with bunkers rebuilt', () => {
    const { state } = clearWithOneInvaderLeft();
    state.bunkers[0]!.pixels.fill(0);

    run(state, CLEARED_TICKS);

    expect(state.phase).toBe('intro');
    expect(state.wave).toBe(2);
    expect(state.fleet.y).toBe(difficultyFor(2).fleetStartY);
    expect(state.fleet.y).toBeGreaterThan(difficultyFor(1).fleetStartY);
    expect(invaderAt(state, 0, 0).hp).toBe(INVADER_HP.squid + difficultyFor(2).extraHp);
    expect(aliveInvaders(state.fleet)).toHaveLength(FLEET_ROWS * FLEET_COLUMNS);
    expect(state.bunkers[0]!.pixels.some(Boolean)).toBe(true);

    run(state, 100);
    expect(state.phase).toBe('playing');
  });
});

describe('the score', () => {
  it('never goes beyond what the leaderboard can show', () => {
    const state = quietGame();
    state.score = MAX_DISPLAYED_SCORE - 5;
    const squid = invaderAt(state, 0, 0);
    squid.hp = 1;
    aimAt(state, squid);

    advance(state, input({ fire: true }));

    expect(state.score).toBe(MAX_DISPLAYED_SCORE);
  });
});

describe('the engine', () => {
  it('plays the same game twice from the same controls', () => {
    const digest = (state: GameState): string => JSON.stringify({ ...state, bunkers: state.bunkers.map((bunker) => [...bunker.pixels]) });
    const first = createGame();
    const second = createGame();
    for (let tick = 0; tick < 3000; tick++) {
      const controls = input({ left: tick % 90 < 30, right: tick % 90 >= 60, up: tick % 50 < 10, fire: tick % 7 < 5 });
      advance(first, controls);
      advance(second, controls);
    }
    expect(digest(second)).toBe(digest(first));
  });

  it('keeps ticking after the game is over without changing anything that counts', () => {
    const state = quietGame();
    state.phase = 'gameOver';
    const score = state.score;
    expect(advance(state, input({ fire: true }))).toEqual([]);
    expect(state.score).toBe(score);
    expect(state.phase).toBe('gameOver');
  });
});
