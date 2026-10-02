import { describe, expect, it } from 'vitest';
import {
  BOMB_SIZE,
  CANNON_SIZE,
  CAPSULE_SIZE,
  INVADER_SIZE,
  LASER_RADIUS,
  UFO_SIZE,
  type InvaderKind,
} from '../../../shared/game/constants.ts';
import { SPRITES, type SpriteDefinition } from './spriteDefinitions.ts';

interface Size {
  width: number;
  height: number;
}

function dimensions(sprite: SpriteDefinition): Size {
  return { width: sprite.rows[0]!.length, height: sprite.rows.length };
}

const INVADER_KINDS: InvaderKind[] = ['squid', 'crab', 'octopus'];
const RETICLE_SIZE: Size = { width: LASER_RADIUS * 2 + 1, height: LASER_RADIUS * 2 + 1 };

const EXPECTED_SIZES: Array<[string, SpriteDefinition, Size]> = [
  ...INVADER_KINDS.flatMap((kind) =>
    SPRITES.invaders[kind].map((frame, index): [string, SpriteDefinition, Size] => [
      `${kind} frame ${index + 1}`,
      frame,
      INVADER_SIZE[kind],
    ]),
  ),
  ['ufo', SPRITES.ufo, UFO_SIZE],
  ['bomb frame 1', SPRITES.bombs[0], BOMB_SIZE],
  ['bomb frame 2', SPRITES.bombs[1], BOMB_SIZE],
  ['nova capsule', SPRITES.capsules.nova[0], CAPSULE_SIZE],
  ['bright nova capsule', SPRITES.capsules.nova[1], CAPSULE_SIZE],
  ['repair capsule', SPRITES.capsules.repair[0], CAPSULE_SIZE],
  ['bright repair capsule', SPRITES.capsules.repair[1], CAPSULE_SIZE],
  ['cannon', SPRITES.cannon, CANNON_SIZE],
  ['cannon wreck', SPRITES.cannonWreck, CANNON_SIZE],
  ['idle reticle', SPRITES.reticle.idle, RETICLE_SIZE],
  ['firing reticle', SPRITES.reticle.firing, RETICLE_SIZE],
  ['overheated reticle', SPRITES.reticle.overheated, RETICLE_SIZE],
];

describe('sprite definitions', () => {
  it.each(EXPECTED_SIZES)('draws the %s as big as its hitbox', (_name, sprite, size) => {
    expect(dimensions(sprite)).toEqual(size);
  });

  it.each(EXPECTED_SIZES)('has a rectangular, fully painted %s', (_name, sprite) => {
    for (const row of sprite.rows) {
      expect(row).toHaveLength(sprite.rows[0]!.length);
      for (const pixel of row) if (pixel !== '.') expect(sprite.colors[pixel], `pixel ${pixel}`).toBeDefined();
    }
  });

  it('puts the barrel of the cannon on the column where its laser starts', () => {
    expect(SPRITES.cannon.rows[0]!.indexOf('H')).toBe(6);
  });

  it('draws a reticle that looks the same from every side', () => {
    const { rows } = SPRITES.reticle.idle;
    const mirrored = rows.map((row) => [...row].reverse().join(''));
    expect(mirrored).toEqual(rows);
    expect([...rows].reverse()).toEqual(rows);
  });

  it('leaves the center of the reticle on the cross', () => {
    expect(SPRITES.reticle.idle.rows[LASER_RADIUS]![LASER_RADIUS]).toBe('X');
  });

  it('makes the two bomb frames different, so that it wiggles', () => {
    expect(SPRITES.bombs[0].rows).not.toEqual(SPRITES.bombs[1].rows);
  });

  it('writes the letter of each capsule on its body', () => {
    expect(SPRITES.capsules.nova[0].rows.join('')).toContain('L');
    expect(SPRITES.capsules.nova[0].rows).not.toEqual(SPRITES.capsules.repair[0].rows);
  });
});
