/**
 * The invaders of the scoring table, drawn here instead of taken from the canvas renderer: the screens cannot reach the
 * adapters, and a few characters of art are not worth a layer of their own.
 */
const SPRITES = {
  squid: ['...##...', '..####..', '.######.', '##.##.##', '########', '..#..#..', '.#.##.#.', '#.#..#.#'],
  crab: [
    '..#.....#..',
    '...#...#...',
    '..#######..',
    '.##.###.##.',
    '###########',
    '#.#######.#',
    '#.#.....#.#',
    '...##.##...',
  ],
  octopus: [
    '....####....',
    '.##########.',
    '############',
    '###..##..###',
    '############',
    '...##..##...',
    '..##.##.##..',
    '##........##',
  ],
  ufo: [
    '.....######.....',
    '...##########...',
    '..############..',
    '.##.##.##.##.##.',
    '################',
    '..###..##..###..',
    '...#........#...',
  ],
} as const;

export type SpriteName = keyof typeof SPRITES;

/** One square per lit pixel, as a single path so that the sprite stays crisp at any size. */
function outline(rows: readonly string[]): string {
  return rows
    .flatMap((row, y) => [...row].flatMap((cell, x) => (cell === '#' ? [`M${x} ${y}h1v1h-1z`] : [])))
    .join('');
}

/** Every pixel is an eighth of the text size, so that the sprites share a scale and grow with the text around them. */
const PIXELS_PER_EM = 8;

/** A decorative pixel-art sprite, in the color of the text around it. */
export function PixelSprite({ name }: { name: SpriteName }) {
  const rows = SPRITES[name];
  const columns = rows[0].length;
  return (
    <svg
      className="sprite"
      width={`${columns / PIXELS_PER_EM}em`}
      height={`${rows.length / PIXELS_PER_EM}em`}
      viewBox={`0 0 ${columns} ${rows.length}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <path d={outline(rows)} fill="currentColor" />
    </svg>
  );
}
