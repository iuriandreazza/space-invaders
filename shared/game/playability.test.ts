import { describe, expect, it } from 'vitest';
import { maxPlausibleScore } from '../scoring-limits.ts';
import { TICKS_PER_SECOND } from './constants.ts';
import { advance, createGame } from './game.ts';
import { MAX_REPLAY_RUNS, ReplayRecorder } from './replay.ts';
import { hunter, noisyPolicy, wanderer } from './testing/policies.ts';
import type { GameState, Input } from './types.ts';

type Policy = (state: GameState, tick: number) => Input;

interface Played {
  state: GameState;
  ticks: number;
  /** The score at the end of each second, to hold against the plausibility cap of the API. */
  scoreBySecond: number[];
  runs: number;
}

function play(policy: Policy, maxTicks = 60 * 60 * TICKS_PER_SECOND): Played {
  const state = createGame();
  const recorder = new ReplayRecorder();
  const scoreBySecond: number[] = [];
  let ticks = 0;
  while (state.phase !== 'gameOver' && ticks < maxTicks) {
    const controls = policy(state, ticks);
    advance(state, controls);
    recorder.record(controls);
    ticks++;
    if (ticks % TICKS_PER_SECOND === 0) scoreBySecond.push(state.score);
  }
  return { state, ticks, scoreBySecond, runs: recorder.replay().length / 2 };
}

const seconds = (ticks: number): number => ticks / TICKS_PER_SECOND;

describe('the game as a player meets it', () => {
  const good = play(hunter);

  it('can be played well: a player that aims at what matters clears several waves', () => {
    expect(good.state.wave).toBeGreaterThanOrEqual(5);
    expect(good.state.score).toBeGreaterThan(5_000);
  });

  it('does not go on forever, even for a player that plays well', () => {
    expect(good.state.phase).toBe('gameOver');
    expect(seconds(good.ticks)).toBeLessThan(20 * 60);
  });

  it('does not keep a player waiting who does nothing', () => {
    const idle = play(() => ({ left: false, right: false, up: false, down: false, fire: false }));
    expect(idle.state.phase).toBe('gameOver');
    expect(idle.state.score).toBe(0);
    expect(seconds(idle.ticks)).toBeLessThan(4 * 60);
  });

  it('gives little to a player that fires at random', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const random = play(noisyPolicy(seed));
      expect(random.state.score, `seed ${seed}`).toBeLessThan(good.state.score / 3);
    }
  });
});

describe('the points the API accepts', () => {
  it('stay above what any of these runs earned, second by second', () => {
    const policies: Policy[] = [hunter, wanderer(1), wanderer(2), noisyPolicy(3), noisyPolicy(4)];
    for (const policy of policies) {
      const { scoreBySecond } = play(policy);
      scoreBySecond.forEach((score, index) => {
        expect(score, `after ${index + 1} s`).toBeLessThanOrEqual(maxPlausibleScore(index + 1));
      });
    }
  });

  it('are an order of magnitude more than the best player in these runs earns per second', () => {
    const { state, ticks } = play(hunter);
    expect(state.score / seconds(ticks) * 10).toBeLessThan(maxPlausibleScore(seconds(ticks)) / seconds(ticks));
  });
});

describe('the recordings of a mouse-like hand', () => {
  /** The game does not go on for longer than this in practice (see above), however well it is played. */
  const LONGEST_REAL_GAME_SECONDS = 20 * 60;

  it('fit in the number of runs the API takes, for the longest game there is', () => {
    for (const policy of [hunter, wanderer(1), wanderer(2)]) {
      const { runs, ticks } = play(policy);
      const runsPerSecond = runs / seconds(ticks);
      expect(runsPerSecond * LONGEST_REAL_GAME_SECONDS, `${runsPerSecond.toFixed(1)} runs per second`).toBeLessThan(MAX_REPLAY_RUNS);
    }
  });
});
