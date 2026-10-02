/**
 * Rules of the game in its logical resolution: 240 x 320 pixels, portrait, like the cabinet that inspires it.
 * The simulation runs at a fixed 60 ticks per second, so every speed is "pixels per tick".
 * Y grows downwards, as on the canvas.
 */

export const TICKS_PER_SECOND = 60;

// Screen layout
export const SCREEN_WIDTH = 240;
export const SCREEN_HEIGHT = 320;
/** The strip at the top that the renderer keeps for the score; nothing of the game lives in it. */
export const HUD_HEIGHT = 22;

// Aim: the reticle the two lasers converge on. The player steers it; it moves a fixed step per tick.
export const AIM_SPEED = 4;
/** `minY` keeps the whole circle of the lasers below the strip of the score: the HUD plus the laser radius. */
export const AIM_BOUNDS = { minX: 4, maxX: 235, minY: 31, maxY: 292 } as const;
export const AIM_START = { x: 120, y: 190 } as const;

// Lasers
/** Radius of the circle around the reticle where the lasers burn whatever they touch. */
export const LASER_RADIUS = 9;
/** Damage per tick of each cannon that is still standing. */
export const LASER_DAMAGE_PER_CANNON = 2;
export const ENERGY_MAX = 1;
export const ENERGY_DRAIN_PER_TICK = 1 / 300;
export const ENERGY_RECHARGE_PER_TICK = 1 / 480;
/** After the energy runs out the lasers stay off until it has recovered this far. */
export const OVERHEAT_RESUME_ENERGY = 0.35;

// Cannons: two, fixed in the bottom corners. Their lasers start at the tip.
export const CANNON_COUNT = 2;
export const CANNON_SIZE = { width: 13, height: 9 } as const;
export const CANNON_X = [3, SCREEN_WIDTH - 3 - CANNON_SIZE.width] as const;
export const CANNON_Y = 302;
export const CANNON_MAX_HP = 3;
/** Where the laser of a cannon starts: the middle of its top edge. */
export const CANNON_TIP_OFFSET_X = 6;

// The fleet: a grid that sweeps sideways and steps down when it reaches a wall.
export const FLEET_COLUMNS = 11;
export const FLEET_ROWS = 6;
export const FLEET_CELL = { width: 18, height: 15 } as const;
export const FLEET_START_X = (SCREEN_WIDTH - FLEET_COLUMNS * FLEET_CELL.width) / 2;
export const FLEET_START_Y = 36;
export const FLEET_STEP_PX = 2;
export const FLEET_DROP_PX = 8;
/** Distance the fleet keeps from the side walls before it turns. */
export const FLEET_WALL_MARGIN = 4;
/** An invader that gets this low has landed: the cannons are lost. */
export const INVASION_Y = 276;
/** Ticks between two steps of the fleet: `alive * this`, rounded up, but never above the next one. */
export const FLEET_TICKS_PER_INVADER = 0.55;
export const FLEET_MAX_STEP_TICKS = 60;

export type InvaderKind = 'squid' | 'crab' | 'octopus';

/** Kind of invader on each row of the fleet, top to bottom, like the classic: the farthest are worth the most. */
export const ROW_KINDS: readonly InvaderKind[] = ['squid', 'crab', 'crab', 'octopus', 'octopus', 'octopus'];

export const INVADER_SIZE: Record<InvaderKind, { width: number; height: number }> = {
  squid: { width: 8, height: 8 },
  crab: { width: 11, height: 8 },
  octopus: { width: 12, height: 8 },
};

/** Damage, in laser damage units, that destroys an invader of the first wave. */
export const INVADER_HP: Record<InvaderKind, number> = { squid: 40, crab: 28, octopus: 20 };
/** Hit points each wave adds to every invader, up to {@link MAX_EXTRA_HP}. */
export const EXTRA_HP_PER_WAVE = 2;
export const MAX_EXTRA_HP = 40;

export const POINTS: Record<InvaderKind, number> = { squid: 30, crab: 20, octopus: 10 };

// Bombs: dropped by the lowest invader of a column, flying straight at a cannon or a bunker.
export const BOMB_SIZE = { width: 3, height: 7 } as const;
export const BOMB_SPEED = 2;
/** Fastest sideways drift of a bomb: it is dropped, not thrown. */
export const BOMB_MAX_DRIFT = 1.2;
/** How far from its target a bomb may land, on either side. */
export const BOMB_SCATTER = 8;
/** Share (out of 100) of the bombs aimed at a cannon rather than at a bunker. */
export const BOMB_AT_CANNON_PERCENT = 60;

// Bunkers: four, made of pixels that bombs and invaders eat away.
export const BUNKER_COUNT = 4;
export const BUNKER_SIZE = { width: 24, height: 16 } as const;
export const BUNKER_Y = 246;
export const BUNKER_X = [18, 78, 138, 198] as const;

// Flying saucer
export const UFO_SIZE = { width: 16, height: 7 } as const;
export const UFO_Y = 26;
export const UFO_SPEED = 1;
export const UFO_HP = 80;
/** Ticks between the end of one saucer and the next. */
export const UFO_INTERVAL = 1_500;
/** Points of the n-th saucer, cycling: a fixed table, so that a run can be played again. */
export const UFO_POINTS: readonly number[] = [100, 50, 50, 100, 150, 100, 100, 50, 300, 100, 100, 100, 50, 150, 100];
/** The saucer only shows up while at least this many invaders are left. */
export const UFO_MIN_INVADERS = 6;

// Capsules: dropped by a destroyed saucer; a laser has to touch one to collect it.
export const CAPSULE_SIZE = { width: 9, height: 9 } as const;
export const CAPSULE_SPEED = 1;
/** A capsule can only be collected once it has fallen clear of the saucer lane, so that killing the saucer does not pick it up too. */
export const CAPSULE_COLLECTABLE_Y = UFO_Y + UFO_SIZE.height + 2 * LASER_RADIUS;
/** Damage a nova capsule does to every invader on the screen. */
export const NOVA_DAMAGE = 20;
/** Hit points a repair capsule gives each cannon, bringing back one that was lost. */
export const REPAIR_HP = 2;
/** Hit points a cleared wave gives each cannon, bringing back one that was lost. */
export const WAVE_REPAIR_HP = 1;

// Score
export const WAVE_BONUS_PER_WAVE = 100;
export const MAX_WAVE_BONUS = 1_000;
export const MAX_DISPLAYED_SCORE = 999_999;

// Timings (ticks)
export const INTRO_TICKS = 90;
export const CLEARED_TICKS = 150;
export const DEATH_TICKS = 120;
export const EXPLOSION_TICKS = { invader: 18, bomb: 10, cannon: 60, ufo: 40, nova: 30 } as const;

/** Seed of the only random stream of the game (bombs and where they land). */
export const WORLD_SEED = 0x53494e56;
