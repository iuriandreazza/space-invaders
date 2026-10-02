import { verifyReplay, type Replay, type ReplayVerdict } from '../../shared/game/replay.ts';
import type { RunVerdict, RunVerifier } from '../application/ports.ts';
import { logSecurityEvent } from './security-log.ts';

/** A stack trace is long and says nothing the first lines do not; the cap keeps one event to one reasonable line. */
const MAX_LOGGED_ERROR_LENGTH = 2_000;

/** Plays recordings with the very engine the players run, which lives in shared/game. */
export class EngineRunVerifier implements RunVerifier {
  readonly #play: (replay: Replay) => ReplayVerdict;

  constructor(play: (replay: Replay) => ReplayVerdict = verifyReplay) {
    this.#play = play;
  }

  verify(replay: Replay): RunVerdict {
    try {
      return this.#play(replay);
    } catch (error) {
      // Not the player's fault: an honest run may have hit a bug in the engine, which is worth a line in the log.
      const cause = error instanceof Error ? (error.stack ?? error.message) : String(error);
      logSecurityEvent('engine_error', { code: 'engine_error', error: cause.slice(0, MAX_LOGGED_ERROR_LENGTH) });
      return { ok: false, reason: 'engine_error' };
    }
  }
}
