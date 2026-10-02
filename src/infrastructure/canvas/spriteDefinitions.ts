import { LASER_RADIUS } from '../../../shared/game/constants.ts';
import type { InvaderKind } from '../../../shared/game/constants.ts';
import type { CapsuleKind } from '../../../shared/game/types.ts';
import { COLORS } from './palette.ts';
import { circleOutline } from './pixelGeometry.ts';
import { glyphRows } from './pixelFont.ts';

/** A sprite as text: one character per pixel, `.` is transparent. */
export interface SpriteDefinition {
  rows: readonly string[];
  colors: Readonly<Record<string, string>>;
}

type Frames = readonly [SpriteDefinition, SpriteDefinition];

function solid(rows: readonly string[], color: string): SpriteDefinition {
  return { rows, colors: { '#': color } };
}

/** Gives every row of a one-color bitmap its own color letter, so that a classic shape can be shaded. */
function paintRows(shape: readonly string[], rowPaint: string): string[] {
  return shape.map((row, index) => row.replaceAll('#', rowPaint[index]!));
}

const INVADERS: Record<InvaderKind, Frames> = {
  squid: [
    solid(['...##...', '..####..', '.######.', '##.##.##', '########', '..#..#..', '.#.##.#.', '#.#..#.#'], COLORS.squid),
    solid(['...##...', '..####..', '.######.', '##.##.##', '########', '.#.##.#.', '#......#', '.#....#.'], COLORS.squid),
  ],
  crab: [
    solid(
      ['..#.....#..', '...#...#...', '..#######..', '.##.###.##.', '###########', '#.#######.#', '#.#.....#.#', '...##.##...'],
      COLORS.crab,
    ),
    solid(
      ['..#.....#..', '#..#...#..#', '#.#######.#', '###.###.###', '###########', '.#########.', '..#.....#..', '.#.......#.'],
      COLORS.crab,
    ),
  ],
  octopus: [
    solid(
      ['....####....', '.##########.', '############', '###..##..###', '############', '...##..##...', '..##.##.##..', '##........##'],
      COLORS.octopus,
    ),
    solid(
      ['....####....', '.##########.', '############', '###..##..###', '############', '..###..###..', '.##..##..##.', '..##....##..'],
      COLORS.octopus,
    ),
  ],
};

const UFO: SpriteDefinition = {
  rows: paintRows(
    ['.....######.....', '...##########...', '..############..', '.##.##.##.##.##.', '################', '..###..##..###..', '...#........#...'],
    'DDBBBLL',
  ),
  colors: { D: COLORS.ufoDome, B: COLORS.ufoBody, L: COLORS.ufoLegs },
};

/** A zigzag falling down: the head is white and the tail pink. The two frames are mirror images. */
const BOMB_ROW_PAINT = 'TTTHHHH';
const BOMB_COLORS = { T: COLORS.bombTail, H: COLORS.bombHead };
const BOMBS: Frames = [
  { rows: paintRows(['.#.', '#..', '.#.', '..#', '.#.', '#..', '.#.'], BOMB_ROW_PAINT), colors: BOMB_COLORS },
  { rows: paintRows(['.#.', '..#', '.#.', '#..', '.#.', '..#', '.#.'], BOMB_ROW_PAINT), colors: BOMB_COLORS },
];

/** A round capsule: `E` is its rim and `F` its body, where the letter goes. */
const CAPSULE_SHAPE = [
  '..EEEEE..',
  '.EFFFFFE.',
  'EFFFFFFFE',
  'EFFFFFFFE',
  'EFFFFFFFE',
  'EFFFFFFFE',
  'EFFFFFFFE',
  '.EFFFFFE.',
  '..EEEEE..',
];
const CAPSULE_LETTER_COLUMN = 3;
const CAPSULE_LETTER_ROW = 2;

function capsuleRows(letter: string): string[] {
  const rows = CAPSULE_SHAPE.map((row) => [...row]);
  glyphRows(letter).forEach((glyphRow, y) => {
    [...glyphRow].forEach((pixel, x) => {
      if (pixel === '#') rows[CAPSULE_LETTER_ROW + y]![CAPSULE_LETTER_COLUMN + x] = 'L';
    });
  });
  return rows.map((row) => row.join(''));
}

/** The capsule pulses by swapping between its dim and its bright body. */
function capsule(letter: string, dimBody: string, brightBody: string): Frames {
  const rows = capsuleRows(letter);
  const colors = { E: COLORS.capsuleEdge, L: COLORS.capsuleLetter };
  return [
    { rows, colors: { ...colors, F: dimBody } },
    { rows, colors: { ...colors, F: brightBody } },
  ];
}

const CAPSULES: Record<CapsuleKind, Frames> = {
  nova: capsule('B', COLORS.novaCapsule, COLORS.novaCapsuleBright),
  repair: capsule('R', COLORS.repairCapsule, COLORS.repairCapsuleBright),
};

/** A wedge with the barrel up: its tip is the middle of the top row, where the laser starts. */
const CANNON: SpriteDefinition = {
  rows: [
    '......H......',
    '.....OOO.....',
    '.....OHO.....',
    '....OOHOO....',
    '...OOOHOOO...',
    '..OOOOOOOOO..',
    '.OOOOOOOOOOO.',
    'OOOOOOOOOOOOO',
    'SSSSSSSSSSSSS',
  ],
  colors: { H: COLORS.cannonHighlight, O: COLORS.cannon, S: COLORS.cannonShade },
};

const CANNON_WRECK: SpriteDefinition = {
  rows: [
    '.............',
    '.............',
    '.............',
    '....O..O.....',
    '...O.OOO.O...',
    '..OOOOOOOOO..',
    '.OOOOOOOOOOO.',
    'OOOOOOOOOOOOO',
    'SSSSSSSSSSSSS',
  ],
  colors: { O: COLORS.wreck, S: COLORS.wreckShade },
};

const RETICLE_SIZE = LASER_RADIUS * 2 + 1;
/** Short enough to leave a gap between the cross and the ring. */
const RETICLE_CROSS_ARM = LASER_RADIUS - 4;

/** The circle where the lasers burn, with an X in the middle: `R` is the ring and `X` the cross. */
function reticleRows(): string[] {
  const grid = Array.from({ length: RETICLE_SIZE }, () => Array<string>(RETICLE_SIZE).fill('.'));
  const plot = (dx: number, dy: number, pixel: string) => {
    grid[LASER_RADIUS + dy]![LASER_RADIUS + dx] = pixel;
  };
  for (const { x, y } of circleOutline(LASER_RADIUS)) plot(x, y, 'R');
  for (let step = -RETICLE_CROSS_ARM; step <= RETICLE_CROSS_ARM; step++) {
    plot(step, step, 'X');
    plot(step, -step, 'X');
  }
  return grid.map((row) => row.join(''));
}

const RETICLE_ROWS = reticleRows();

function reticle(ring: string, cross: string): SpriteDefinition {
  return { rows: RETICLE_ROWS, colors: { R: ring, X: cross } };
}

export const SPRITES = {
  invaders: INVADERS,
  ufo: UFO,
  bombs: BOMBS,
  capsules: CAPSULES,
  cannon: CANNON,
  cannonWreck: CANNON_WRECK,
  reticle: {
    idle: reticle(COLORS.reticle, COLORS.reticleCross),
    firing: reticle(COLORS.reticleFiring, COLORS.reticleCrossFiring),
    overheated: reticle(COLORS.reticleDim, COLORS.reticleDim),
  },
} as const;
