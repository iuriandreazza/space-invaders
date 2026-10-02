import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Replay } from '../../shared/game/replay.ts';

/**
 * SHA-256 of the recording's JSON, taken over the effective replay the engine hands back and not over what was sent:
 * a game can be dressed up with controls the engine ignores, and only its effective replay is the same for every
 * spelling of it, so the same game cannot be submitted twice under different hashes.
 */
export function replayFingerprint(replay: Replay): string {
  return createHash('sha256').update(JSON.stringify(replay)).digest('hex');
}

export function compressReplay(replay: Replay): Uint8Array {
  return gzipSync(JSON.stringify(replay));
}

export function decompressReplay(compressed: Uint8Array): Replay {
  return JSON.parse(gunzipSync(compressed).toString('utf8')) as Replay;
}
