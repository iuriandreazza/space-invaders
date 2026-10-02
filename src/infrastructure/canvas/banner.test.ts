import { describe, expect, it } from 'vitest';
import { bannerLines } from './banner.ts';
import { createTestState } from './testSupport.ts';

const texts = (state: ReturnType<typeof createTestState>) => bannerLines(state).map((line) => line.text);

describe('bannerLines', () => {
  it('announces the wave and tells the player to get ready', () => {
    expect(texts(createTestState({ phase: 'intro', wave: 7 }))).toEqual(['WAVE 7', 'GET READY']);
  });

  it('shows the bonus of the wave that was cleared', () => {
    expect(texts(createTestState({ phase: 'cleared', waveBonus: 300 }))).toEqual(['WAVE CLEARED', 'BONUS +300']);
  });

  it('ends the game', () => {
    expect(texts(createTestState({ phase: 'gameOver' }))).toEqual(['GAME OVER']);
  });

  it.each(['playing', 'dying'] as const)('says nothing while %s', (phase) => {
    expect(bannerLines(createTestState({ phase }))).toEqual([]);
  });
});
