import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GOLDEN_RUNS } from '../../shared/game/testing/golden-runs.ts';
import { compressReplay, decompressReplay, replayFingerprint } from './replay-codec.ts';

describe('replayFingerprint', () => {
  it('is the SHA-256 of the replay written as JSON', () => {
    const expected = createHash('sha256').update('[16,4,0,9]').digest('hex');

    expect(replayFingerprint([16, 4, 0, 9])).toBe(expected);
  });

  it('is the same for equal replays and different for different ones', () => {
    expect(replayFingerprint([1, 2, 3, 4])).toBe(replayFingerprint([1, 2, 3, 4]));
    expect(replayFingerprint([1, 2, 3, 4])).not.toBe(replayFingerprint([1, 2, 3, 5]));
  });
});

describe('compressReplay and decompressReplay', () => {
  it.each(GOLDEN_RUNS)('give back the golden run "$name" as it was', (run) => {
    expect(decompressReplay(compressReplay(run.replay))).toEqual(run.replay);
  });

  it('make a real recording smaller than its JSON', () => {
    const [, cautious] = GOLDEN_RUNS;

    expect(compressReplay(cautious.replay).byteLength).toBeLessThan(JSON.stringify(cautious.replay).length / 2);
  });

  it('refuse bytes that are not a compressed replay', () => {
    expect(() => decompressReplay(new Uint8Array([0]))).toThrow();
  });
});
