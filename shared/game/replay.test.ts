import { describe, expect, it } from 'vitest';
import { AIM_BOUNDS, INTRO_TICKS } from './constants.ts';
import { advance, createGame, effectiveInput } from './game.ts';
import {
  ENGINE_VERSION,
  MAX_REPLAY_RUNS,
  MAX_REPLAY_TICKS,
  ReplayRecorder,
  decodeInput,
  encodeInput,
  replayProblem,
  replayTicks,
  verifyReplay,
} from './replay.ts';
import { GOLDEN_LAYOUT_DIGEST, GOLDEN_RUNS, GOLDEN_RUNS_ENGINE_VERSION } from './testing/golden-runs.ts';
import { GOLDEN_DIFFICULTY_WAVES, layoutDigest } from './testing/layout-digest.ts';
import { noisyPolicy, recordRun, wanderer } from './testing/policies.ts';
import { NO_INPUT, type GameState, type Input } from './types.ts';

const input = (overrides: Partial<Input>): Input => ({ ...NO_INPUT, ...overrides });

describe('controls', () => {
  it('survive the trip through a bitmask, in every combination', () => {
    for (let controls = 0; controls < 32; controls++) {
      expect(encodeInput(decodeInput(controls))).toBe(controls);
    }
  });

  it('give every button its own bit', () => {
    const buttons = ['left', 'right', 'up', 'down', 'fire'] as const;
    const bits = buttons.map((button) => encodeInput(input({ [button]: true })));
    expect(new Set(bits).size).toBe(buttons.length);
    expect(bits.every((bit) => Number.isInteger(Math.log2(bit)))).toBe(true);
  });
});

describe('ReplayRecorder', () => {
  it('merges neighbouring ticks that have the same controls', () => {
    const recorder = new ReplayRecorder();
    const left = input({ left: true });
    const fire = input({ fire: true });
    [left, left, left, fire, left].forEach((tick) => recorder.record(tick));

    expect(recorder.replay()).toEqual([encodeInput(left), 3, encodeInput(fire), 1, encodeInput(left), 1]);
  });

  it('hands out copies, so a recording cannot be altered afterwards', () => {
    const recorder = new ReplayRecorder();
    recorder.record(input({ up: true }));
    recorder.replay().push(99, 99);
    expect(recorder.replay()).toHaveLength(2);
  });

  it('counts the ticks it holds', () => {
    expect(replayTicks([1, 5, 0, 3, 16, 2])).toBe(10);
  });
});

describe('replayProblem', () => {
  it.each([
    ['null', null],
    ['text', 'left'],
    ['an object', { 0: 1, 1: 1, length: 2 }],
    ['nothing', []],
    ['an odd number of values', [1, 5, 2]],
    ['a fractional control', [1.5, 5]],
    ['a text control', ['1', 5]],
    ['a negative control', [-1, 5]],
    ['an unknown button', [32, 5]],
    ['a fractional length', [1, 2.5]],
    ['a zero length', [1, 0]],
    ['a negative length', [1, -4]],
    ['a text length', [1, '5']],
    ['neighbouring runs with the same controls', [1, 5, 0, 2, 0, 3]],
    ['a non-finite length', [1, Infinity]],
    ['a run that is too long', [1, MAX_REPLAY_TICKS + 1]],
    ['runs that add up to too long', [1, MAX_REPLAY_TICKS, 2, 1]],
    ['too many runs', Array.from({ length: (MAX_REPLAY_RUNS + 1) * 2 }, () => 1)],
  ])('refuses %s', (_name, value) => {
    expect(replayProblem(value)).toEqual(expect.any(String));
  });

  it.each([
    ['one run', [1, 5]],
    ['several runs', [1, 5, 0, 3, 31, 1]],
    ['the longest run allowed', [0, MAX_REPLAY_TICKS]],
    ['the most runs allowed', Array.from({ length: MAX_REPLAY_RUNS * 2 }, (_, i) => (i % 2 === 0 ? (i / 2) % 2 : 1))],
  ])('accepts %s', (_name, value) => {
    expect(replayProblem(value)).toBeNull();
  });
});

describe('verifyReplay', () => {
  const run = recordRun(wanderer(5));

  it('arrives at the score of the session that recorded it', () => {
    expect(verifyReplay(run.replay)).toMatchObject({ ok: true, score: run.score, ticks: run.ticks });
    expect(replayTicks(run.replay)).toBe(run.ticks);
  });

  it('is deterministic', () => {
    expect(verifyReplay(run.replay)).toEqual(verifyReplay(run.replay));
  });

  it('refuses a run that stops before the cannons are lost', () => {
    const shortened = [...run.replay];
    shortened[shortened.length - 1]! -= 1;
    expect(verifyReplay(shortened)).toEqual({ ok: false, reason: 'unfinished' });
  });

  it('refuses a run that goes on after the game is over', () => {
    const extended = [...run.replay, 0, 1];
    expect(verifyReplay(extended)).toEqual({ ok: false, reason: 'continued_after_game_over' });
  });

  it('reproduces games played with random controls, which find the odd corners of the rules', { timeout: 60_000 }, () => {
    for (let seed = 1; seed <= 40; seed++) {
      const random = recordRun(noisyPolicy(seed));
      expect(replayProblem(random.replay), `seed ${seed}`).toBeNull();
      expect(verifyReplay(random.replay), `seed ${seed}`).toMatchObject({ ok: true, score: random.score, ticks: random.ticks });
    }
  });

  it('does not reproduce the score when the controls are different', () => {
    const handsOff = run.replay.map((value, index) => (index % 2 === 0 ? 0 : value));
    const verdict = verifyReplay(handsOff);
    expect(verdict.ok && verdict.score === run.score).toBe(false);
  });
});

/** What a player may also be pressing without any effect: the same game, written down differently. */
function withIgnoredControls(policy: (state: GameState, tick: number) => Input, seed: number) {
  let random = seed >>> 0;
  const next = (): number => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return random / 4294967296;
  };
  const sometimesBoth = (first: boolean, second: boolean): [boolean, boolean] =>
    !first && !second && next() < 0.3 ? [true, true] : [first, second];

  return (state: GameState, tick: number): Input => {
    const wanted = policy(state, tick);
    if (state.phase !== 'playing') {
      return { left: next() < 0.5, right: next() < 0.5, up: next() < 0.5, down: next() < 0.5, fire: next() < 0.5 };
    }
    const [left, right] = sometimesBoth(wanted.left, wanted.right);
    const [up, down] = sometimesBoth(wanted.up, wanted.down);
    return {
      left: left || (state.aim.x <= AIM_BOUNDS.minX && !right && next() < 0.5),
      right,
      up: up || (state.aim.y <= AIM_BOUNDS.minY && !down && next() < 0.5),
      down,
      fire: state.overheated ? next() < 0.5 : wanted.fire,
    };
  };
}

describe('the effective replay of a verdict', () => {
  const verified = (replay: readonly number[]) => {
    const verdict = verifyReplay(replay);
    if (!verdict.ok) throw new Error(`the run should have verified: ${verdict.reason}`);
    return verdict;
  };

  it('is a replay the API would accept, and playing it gives the very same game back', () => {
    const { replay } = recordRun(wanderer(9));
    const verdict = verified(replay);

    expect(replayProblem(verdict.effective)).toBeNull();
    expect(verifyReplay(verdict.effective)).toEqual(verdict);
  });

  it('is the same for a game written down with controls that the engine ignores', { timeout: 60_000 }, () => {
    for (let seed = 1; seed <= 15; seed++) {
      const plain = recordRun(noisyPolicy(seed));
      const dressedUp = recordRun(withIgnoredControls(noisyPolicy(seed), seed));

      expect(dressedUp.replay, `seed ${seed} was not dressed up`).not.toEqual(plain.replay);
      expect(replayProblem(dressedUp.replay), `seed ${seed}`).toBeNull();
      expect(verified(dressedUp.replay), `seed ${seed}`).toEqual(verified(plain.replay));
    }
  });

  it('is different for a game that differs in a control that matters', () => {
    const { replay } = GOLDEN_RUNS[2]!;
    const recorder = new ReplayRecorder();
    let tick = 0;
    for (let i = 0; i < replay.length; i += 2) {
      for (let held = 0; held < replay[i + 1]!; held++, tick++) {
        const controls = decodeInput(replay[i]!);
        // Steering left once the intro is over, which the reticle obeys, unlike anything pressed before.
        recorder.record(tick === INTRO_TICKS + 5 ? { ...controls, left: !controls.left } : controls);
      }
    }

    expect(verifyReplay(recorder.replay())).not.toEqual(verified(replay));
  });
});

describe('effectiveInput', () => {
  /** A cheap fingerprint of the pixels of the bunkers, which are too many to compare as text on every tick. */
  const pixelsOf = (state: GameState): number[] =>
    state.bunkers.map((bunker) => bunker.pixels.reduce((hash, pixel, index) => (hash + Math.imul(pixel, index + 1)) | 0, 0));

  /** Everything that decides how the game goes on. */
  const outcomeOf = (state: GameState): string => JSON.stringify({ ...state, bunkers: pixelsOf(state) });

  it('only leaves out controls that the engine would have ignored', { timeout: 60_000 }, () => {
    // One game gets what the player pressed, the other what the engine listens to: they must never drift apart.
    for (let seed = 1; seed <= 8; seed++) {
      const policy = withIgnoredControls(noisyPolicy(seed), seed);
      const pressed = createGame();
      const listened = createGame();
      let over = false;
      for (let tick = 0; !over; tick++) {
        const controls = policy(pressed, tick);
        advance(pressed, controls);
        advance(listened, effectiveInput(listened, controls));
        over = pressed.phase === 'gameOver';
        if (tick % 25 === 0 || over) {
          expect(outcomeOf(listened), `seed ${seed}, tick ${tick}`).toBe(outcomeOf(pressed));
        }
      }
    }
  });
});

describe('golden runs', () => {
  it('were recorded with the current engine version', () => {
    expect(GOLDEN_RUNS_ENGINE_VERSION, 'ENGINE_VERSION changed: run `pnpm record-golden-runs`').toBe(ENGINE_VERSION);
  });

  it(`still start from the same game and the same ${GOLDEN_DIFFICULTY_WAVES} waves, which the runs do not all reach`, async () => {
    expect(
      await layoutDigest(),
      'The starting layout or the difficulty tables changed. If that is intended, bump ENGINE_VERSION in replay.ts and run `pnpm record-golden-runs`.',
    ).toBe(GOLDEN_LAYOUT_DIGEST);
  });

  it.each(GOLDEN_RUNS)('are recordings the API accepts: "$name"', ({ replay }) => {
    expect(replayProblem(replay)).toBeNull();
  });

  it.each(GOLDEN_RUNS)('still play back as the run "$name"', ({ replay, score, ticks }) => {
    expect(
      verifyReplay(replay),
      'The rules changed what this run leads to. If that is intended, bump ENGINE_VERSION in replay.ts and run `pnpm record-golden-runs`.',
    ).toMatchObject({ ok: true, score, ticks });
  });
});
