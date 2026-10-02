import { describe, expect, it } from 'vitest';
import { GLYPH_HEIGHT, GLYPH_WIDTH, glyphRows, measureText } from './pixelFont.ts';

const SUPPORTED = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 +-:.!◄►'];
// Every character the font lacks shows as the same glyph, which is how the test tells them apart.
const FALLBACK = glyphRows('~');

describe('pixel font', () => {
  it.each(SUPPORTED)('has its own glyph for %j', (character) => {
    expect(glyphRows(character)).not.toBe(FALLBACK);
  });

  it('shapes every glyph as a rectangle of 3x5 pixels', () => {
    for (const character of [...SUPPORTED, '?']) {
      const rows = glyphRows(character);
      expect(rows).toHaveLength(GLYPH_HEIGHT);
      for (const row of rows) expect(row).toMatch(new RegExp(`^[.#]{${GLYPH_WIDTH}}$`));
    }
  });

  it('shows what it does not know as a question mark', () => {
    expect(FALLBACK).toBe(glyphRows('?'));
  });

  it('writes lower case like upper case', () => {
    expect(glyphRows('a')).toBe(glyphRows('A'));
  });

  it('points the arrows toward opposite sides', () => {
    expect(glyphRows('◄')).toEqual(glyphRows('►').map((row) => [...row].reverse().join('')));
  });

  it('measures the width of a text with one pixel between letters', () => {
    expect(measureText('')).toBe(0);
    expect(measureText('A')).toBe(3);
    expect(measureText('AB')).toBe(7);
    expect(measureText('SCORE')).toBe(19);
  });

  it('scales the measure', () => {
    expect(measureText('AB', 3)).toBe(21);
  });
});
