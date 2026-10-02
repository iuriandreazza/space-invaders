import { ENGINE_VERSION } from '../../shared/game/replay.ts';
import type { SubmitScoreRequest } from '../../shared/leaderboard-contract.ts';

/**
 * The one place that spells out a whole submission, so that when the fields every request must carry change, only this
 * changes. The replay is a stub of the right shape that no engine would finish: a test that needs a verdict takes its
 * replay from FakeRunVerifier or from the golden runs.
 */
export function buildSubmitScoreRequest(overrides: Partial<SubmitScoreRequest> = {}): SubmitScoreRequest {
  return {
    sessionId: 'session-1',
    initials: 'ABC',
    score: 100,
    engineVersion: ENGINE_VERSION,
    replay: [1, 1],
    ...overrides,
  };
}
