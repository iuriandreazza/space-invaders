import { TICKS_PER_SECOND } from '../../shared/game/constants.ts';
import { advance, createGame } from '../../shared/game/game.ts';
import { ReplayRecorder } from '../../shared/game/replay.ts';
import type { GameState } from '../../shared/game/types.ts';
import type { FrameScheduler, InputPort, RendererPort, RunResult, RunningGame, SoundPort } from './ports.ts';

const TICK_MS = 1000 / TICKS_PER_SECOND;
/** Absorbs floating point drift so 60 frames of 16.67 ms always make 60 ticks. */
const TICK_TOLERANCE_MS = 0.001;
/** Longest stretch of real time simulated per frame: after a stall the game resumes instead of fast-forwarding. */
const MAX_FRAME_MS = 100;
/** How long the "game over" banner stays up before the result is handed over. */
const GAME_OVER_LINGER_TICKS = 150;

export interface GameSessionOptions {
  input: InputPort;
  renderer: RendererPort;
  sound: SoundPort;
  scheduler: FrameScheduler;
  onGameOver: (result: RunResult) => void;
  game?: GameState;
}

/**
 * Runs the game at a fixed 60 ticks per second whatever the refresh rate of the screen,
 * and wires the engine to the controls, the screen and the speakers.
 * It owns the adapters it is given: disposing the session disposes them too.
 */
export class GameSession implements RunningGame {
  readonly state: GameState;
  private readonly options: GameSessionOptions;
  private readonly recorder = new ReplayRecorder();
  private frameHandle: number | null = null;
  private lastTimestamp: number | null = null;
  private pendingMs = 0;
  private paused = false;
  private lingerTicks = 0;
  private finished = false;

  constructor(options: GameSessionOptions) {
    this.options = options;
    this.state = options.game ?? createGame();
    this.frameHandle = options.scheduler.request(this.frame);
  }

  pause(): void {
    this.paused = true;
    this.options.sound.setPaused(true);
  }

  resume(): void {
    this.paused = false;
    this.lastTimestamp = null;
    this.pendingMs = 0;
    this.options.sound.setPaused(false);
  }

  setMuted(muted: boolean): void {
    this.options.sound.setMuted(muted);
  }

  dispose(): void {
    if (this.frameHandle !== null) this.options.scheduler.cancel(this.frameHandle);
    this.frameHandle = null;
    this.options.input.dispose();
    this.options.sound.dispose();
  }

  private readonly frame = (timestamp: number): void => {
    this.frameHandle = this.options.scheduler.request(this.frame);
    const elapsed = this.lastTimestamp === null ? 0 : Math.min(timestamp - this.lastTimestamp, MAX_FRAME_MS);
    this.lastTimestamp = timestamp;

    if (!this.paused) this.simulate(elapsed);
    this.options.renderer.render(this.state);
  };

  private simulate(elapsedMs: number): void {
    this.pendingMs += elapsedMs;
    while (this.pendingMs >= TICK_MS - TICK_TOLERANCE_MS && !this.finished) {
      this.pendingMs -= TICK_MS;
      this.tick();
    }
    this.options.sound.sync(this.state);
  }

  private tick(): void {
    const input = this.options.input.read(this.state.aim);
    const wasOver = this.state.phase === 'gameOver';
    const events = advance(this.state, input);
    // The recording ends with the tick in which the game turns over, once the cannons have finished exploding:
    // what follows is only the banner staying up.
    if (!wasOver) this.recorder.record(input);
    for (const event of events) this.options.sound.play(event);

    if (this.state.phase !== 'gameOver') return;
    this.lingerTicks++;
    if (this.lingerTicks >= GAME_OVER_LINGER_TICKS) {
      this.finished = true;
      this.options.onGameOver({ score: this.state.score, replay: this.recorder.replay() });
    }
  }
}
