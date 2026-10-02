import type { SoundPort } from '../../application/ports.ts';

/** Stands in when the browser cannot make sound: the game is still worth playing. */
export const silentSound: SoundPort = {
  play: () => undefined,
  sync: () => undefined,
  setPaused: () => undefined,
  setMuted: () => undefined,
  dispose: () => undefined,
};
