import { describe, expect, it, vi } from 'vitest';
import { AIM_BOUNDS, AIM_SPEED, AIM_START } from '../../shared/game/constants.ts';
import { createGame } from '../../shared/game/game.ts';
import { replayTicks, verifyReplay } from '../../shared/game/replay.ts';
import { NO_INPUT, type GameEvent, type GameState, type Input, type Point } from '../../shared/game/types.ts';
import { GameSession } from './gameSession.ts';
import type { FrameScheduler, InputPort, RendererPort, RunResult, SoundPort } from './ports.ts';

class FakeScheduler implements FrameScheduler {
  private readonly callbacks = new Map<number, (timestamp: number) => void>();
  private nextHandle = 1;

  request(callback: (timestamp: number) => void): number {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.callbacks.delete(handle);
  }

  get pending(): number {
    return this.callbacks.size;
  }

  /** Fires the callbacks registered so far, as the browser does once per repaint. */
  frame(timestamp: number): void {
    const due = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of due) callback(timestamp);
  }

  /** Plays `seconds` of real time at the given refresh rate, starting after `startMs`. */
  playFor(seconds: number, refreshHz: number, startMs = 0): void {
    const frames = Math.round(seconds * refreshHz);
    for (let i = 0; i <= frames; i++) this.frame(startMs + (i * 1000) / refreshHz);
  }
}

type Controls = Input | ((aim: Readonly<Point>, state: GameState) => Input);

function setup(game: GameState = createGame(), controls: Controls = NO_INPUT) {
  const scheduler = new FakeScheduler();
  const input: InputPort = {
    read: vi.fn((aim: Readonly<Point>) => (typeof controls === 'function' ? controls(aim, game) : controls)),
    dispose: vi.fn(),
  };
  const renderer: RendererPort = { render: vi.fn() };
  const sound: SoundPort = {
    play: vi.fn(),
    sync: vi.fn(),
    setPaused: vi.fn(),
    setMuted: vi.fn(),
    dispose: vi.fn(),
  };
  const onGameOver = vi.fn();
  const session = new GameSession({ input, renderer, sound, scheduler, onGameOver, game });
  return { session, scheduler, input, renderer, sound, onGameOver };
}

/** A player who sweeps the reticle from side to side with the trigger held, so the run has some play in it. */
const sweepAndFire = (_aim: Readonly<Point>, state: GameState): Input => ({
  left: state.tick % 240 >= 120,
  right: state.tick % 240 < 120,
  up: state.tick % 600 >= 300,
  down: state.tick % 600 < 300,
  fire: true,
});

describe('GameSession', () => {
  it('runs 60 ticks per second at 60 Hz', () => {
    const { session, scheduler } = setup();
    scheduler.playFor(1, 60);
    expect(session.state.tick).toBe(60);
  });

  it('runs 60 ticks per second on faster screens too', () => {
    const { session, scheduler } = setup();
    scheduler.playFor(1, 144);
    expect(session.state.tick).toBeGreaterThanOrEqual(59);
    expect(session.state.tick).toBeLessThanOrEqual(60);
  });

  it('draws every frame, even between ticks', () => {
    const { scheduler, renderer } = setup();
    scheduler.playFor(1, 144);
    expect(renderer.render).toHaveBeenCalledTimes(145);
  });

  it('does not fast-forward after a stall', () => {
    const { session, scheduler } = setup();
    scheduler.frame(0);
    scheduler.frame(5000);
    expect(session.state.tick).toBeLessThanOrEqual(6);
  });

  it('feeds the controls into the engine and the events into the speakers', () => {
    const { scheduler, input, sound } = setup(createGame(), { ...NO_INPUT, fire: true });
    scheduler.playFor(2, 60);
    expect(input.read).toHaveBeenCalled();
    expect(sound.play).toHaveBeenCalledWith({ type: 'waveStarted', wave: 1 } satisfies GameEvent);
    expect(sound.sync).toHaveBeenCalled();
  });

  it('tells the controls where the reticle is, as it moves', () => {
    // The aim is one object that the engine keeps moving, so each reading has to be copied to be told apart.
    const seen: Point[] = [];
    const { session, scheduler } = setup(createGame(), (aim) => {
      seen.push({ ...aim });
      return { ...NO_INPUT, right: true };
    });

    scheduler.playFor(3, 60);

    expect(seen[0]).toEqual(AIM_START);
    expect(seen.at(-1)!.x).toBeGreaterThan(AIM_START.x);
    expect(seen.every(({ x }, i) => i === 0 || x >= seen[i - 1]!.x)).toBe(true);
    expect(seen.some(({ x }, i) => i > 0 && x - seen[i - 1]!.x === AIM_SPEED)).toBe(true);
    expect(session.state.aim.x).toBe(AIM_BOUNDS.maxX);
  });

  it('stops simulating while paused, keeps drawing, and resumes without a jump', () => {
    const { session, scheduler, renderer, sound } = setup();
    scheduler.playFor(0.5, 60);
    const ticksBeforePause = session.state.tick;

    session.pause();
    expect(sound.setPaused).toHaveBeenLastCalledWith(true);
    const drawn = vi.mocked(renderer.render).mock.calls.length;
    scheduler.playFor(2, 60, 10_000);
    expect(session.state.tick).toBe(ticksBeforePause);
    expect(vi.mocked(renderer.render).mock.calls.length).toBeGreaterThan(drawn);

    session.resume();
    expect(sound.setPaused).toHaveBeenLastCalledWith(false);
    scheduler.frame(20_000);
    expect(session.state.tick).toBe(ticksBeforePause);
    scheduler.frame(20_000 + 1000 / 60);
    expect(session.state.tick).toBe(ticksBeforePause + 1);
  });

  it('reports the final score once, after the game over banner lingered', () => {
    const game = createGame();
    game.phase = 'gameOver';
    game.score = 12_340;
    const { scheduler, onGameOver } = setup(game);

    scheduler.playFor(1, 60);
    expect(onGameOver).not.toHaveBeenCalled();

    scheduler.playFor(4, 60, 1000);
    expect(onGameOver).toHaveBeenCalledTimes(1);
    expect(onGameOver).toHaveBeenCalledWith({ score: 12_340, replay: [] });
  });

  it('hands over the controls of the whole game, so that playing them again gives the same game', () => {
    const { scheduler, onGameOver } = setup(createGame(), sweepAndFire);

    // Ten minutes is far more than the game lasts: the cannons are lost long before.
    scheduler.playFor(600, 60);

    expect(onGameOver).toHaveBeenCalledTimes(1);
    const { score, replay } = vi.mocked(onGameOver).mock.calls[0]![0] as RunResult;
    expect(score).toBeGreaterThan(0);
    expect(verifyReplay(replay)).toMatchObject({ ok: true, score, ticks: replayTicks(replay) });
  });

  it('passes the mute setting to the speakers', () => {
    const { session, sound } = setup();
    session.setMuted(true);
    expect(sound.setMuted).toHaveBeenCalledWith(true);
  });

  it('stops drawing and releases its adapters when disposed', () => {
    const { session, scheduler, input, sound } = setup();
    expect(scheduler.pending).toBe(1);

    session.dispose();
    expect(scheduler.pending).toBe(0);
    expect(input.dispose).toHaveBeenCalledTimes(1);
    expect(sound.dispose).toHaveBeenCalledTimes(1);
  });
});
