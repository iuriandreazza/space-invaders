import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { DEATH_TICKS } from '../../shared/game/constants.ts';
import { replayProblem, replayTicks, type Replay } from '../../shared/game/replay.ts';
import { GOLDEN_RUNS } from '../../shared/game/testing/golden-runs.ts';
import { EngineRunVerifier } from './engine-run-verifier.ts';

/** The effective replay of a game that has to be a finished one. */
function effectiveOf(replay: Replay): Replay {
  const verdict = new EngineRunVerifier().verify(replay);
  if (!verdict.ok) {
    throw new Error(`Expected a finished game, got ${verdict.reason}.`);
  }
  return verdict.effective;
}

describe('EngineRunVerifier', () => {
  let warn: MockInstance;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  describe('with the real engine', () => {
    it.each(GOLDEN_RUNS)('gives the golden run "$name" the score and the length it was recorded with', (run) => {
      expect(new EngineRunVerifier().verify(run.replay)).toMatchObject({ ok: true, score: run.score, ticks: run.ticks });
    });

    it.each(GOLDEN_RUNS)('hands back the effective replay of "$name": well formed, as long, and its own', (run) => {
      const effective = effectiveOf(run.replay);

      expect(replayProblem(effective)).toBeNull();
      expect(replayTicks(effective)).toBe(run.ticks);
      // Playing the effective replay gives the very same game, and so the very same effective replay.
      expect(new EngineRunVerifier().verify(effective)).toEqual({
        ok: true,
        score: run.score,
        ticks: run.ticks,
        effective,
      });
    });

    describe('hands back one effective replay for every way of dressing a game up', () => {
      const noisy = GOLDEN_RUNS[2];
      const [lastControls, lastTicks] = noisy.replay.slice(-2) as [number, number];
      const withLastControls = (controls: number) => [...noisy.replay.slice(0, -2), controls, lastTicks];

      it('as it stands, the last run of the game lies in the explosion of the cannons, where every control is ignored', () => {
        expect(lastTicks).toBeLessThanOrEqual(DEATH_TICKS);
      });

      it.each([
        ['left and right held together', 3],
        ['up and down held together', 12],
      ])('such as %s', (_what, controls) => {
        const dressedUp = withLastControls(controls === lastControls ? 5 : controls);

        // The variant is a perfectly good replay of the same length, which is why it has to be told apart some other way.
        expect(replayProblem(dressedUp)).toBeNull();
        expect(replayTicks(dressedUp)).toBe(noisy.ticks);
        expect(new EngineRunVerifier().verify(dressedUp)).toMatchObject({ ok: true, score: noisy.score });
        expect(effectiveOf(dressedUp)).toEqual(effectiveOf(noisy.replay));
      });
    });

    it('refuses a recording that stops before the game is over', () => {
      const [first] = GOLDEN_RUNS;
      const stoppedShort = first.replay.slice(0, -2);

      expect(new EngineRunVerifier().verify(stoppedShort)).toEqual({ ok: false, reason: 'unfinished' });
    });

    it('refuses a recording that goes on after the game is over', () => {
      const [first] = GOLDEN_RUNS;
      const goingOn = [...first.replay, 31, 30];

      expect(new EngineRunVerifier().verify(goingOn)).toEqual({ ok: false, reason: 'continued_after_game_over' });
    });

    it('cuts a junk recording short instead of playing it to the end', () => {
      const junk = [0, 400_000];
      const started = performance.now();

      const verdict = new EngineRunVerifier().verify(junk);

      expect(verdict).toEqual({ ok: false, reason: 'continued_after_game_over' });
      // Four hundred thousand ticks would take seconds; a player who does nothing loses the cannons within minutes.
      expect(performance.now() - started).toBeLessThan(250);
    });
  });

  describe('when the engine throws', () => {
    const exploding = () => {
      throw new Error('engine bug');
    };

    it('answers with a verdict instead of failing, so that it can never become a server error', () => {
      expect(new EngineRunVerifier(exploding).verify([1, 1])).toEqual({ ok: false, reason: 'engine_error' });
    });

    it('logs the cause as one JSON line, as an honest run may have hit a bug', () => {
      new EngineRunVerifier(exploding).verify([1, 1]);

      expect(warn).toHaveBeenCalledTimes(1);
      const line = (warn.mock.calls[0] as [string])[0];
      expect(line).not.toContain('\n');
      expect(JSON.parse(line)).toMatchObject({ event: 'engine_error', code: 'engine_error', error: expect.stringContaining('engine bug') });
    });
  });

  it('passes on what the engine says, the effective replay included, without logging anything', () => {
    const says = { ok: true, score: 7, ticks: 3, effective: [1, 3] } as const;

    const verdict = new EngineRunVerifier(() => says).verify([1, 1, 2, 2]);

    expect(verdict).toEqual({ ok: true, score: 7, ticks: 3, effective: [1, 3] });
    expect(warn).not.toHaveBeenCalled();
  });
});
