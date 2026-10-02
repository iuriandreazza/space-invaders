import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { TICKS_PER_SECOND } from '../../../shared/game/constants.ts';
import { ENGINE_VERSION, replayProblem, replayTicks } from '../../../shared/game/replay.ts';
import { GOLDEN_RUNS } from '../../../shared/game/testing/golden-runs.ts';
import type { ApiErrorCode, SubmitScoreRequest, SubmitScoreResponse } from '../../../shared/leaderboard-contract.ts';
import { LeaderboardService } from '../../application/leaderboard-service.ts';
import { EngineRunVerifier } from '../engine-run-verifier.ts';
import { InMemoryLeaderboardStore } from '../in-memory-leaderboard-store.ts';
import { ManualClock, SequentialIdGenerator } from '../../testing/fakes.ts';
import { REFUSAL_SCENARIOS } from '../../testing/refusals.ts';
import { createWorld, expectApiError, listScores, send, startSession, submitScore } from '../../testing/world.ts';
import { createApp } from './create-app.ts';

/** Every way the API refuses a submission, and the status it answers with. */
const STATUS_OF: Record<string, number> = {
  invalid_request: 400,
  unknown_session: 404,
  session_already_used: 409,
  outdated_client: 409,
  duplicate_replay: 409,
  invalid_replay: 422,
  score_mismatch: 422,
  implausible_score: 422,
  initials_not_allowed: 422,
};

describe('the way the API answers a submission it refuses', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has a scenario for every code in the table, and the table for every scenario', () => {
    expect(REFUSAL_SCENARIOS.map((scenario) => scenario.code).sort()).toEqual(Object.keys(STATUS_OF).sort());
  });

  describe.each(REFUSAL_SCENARIOS)('for $name', (scenario) => {
    it(`answers ${STATUS_OF[scenario.code]} ${scenario.code}, uncached`, async () => {
      const { response } = await scenario.attempt(createWorld());

      await expectApiError(response, STATUS_OF[scenario.code], scenario.code);
    });

    it('tells nothing about the run beyond the code', async () => {
      const { response } = await scenario.attempt(createWorld());

      const { error } = (await response.json()) as { error: { code: ApiErrorCode; message: string } };
      if (scenario.isSubmission) {
        // No simulated score, no tick count, no number at all.
        expect(error.message).not.toMatch(/\d/);
      }
      expect(Object.keys(error).sort()).toEqual(['code', 'message']);
    });

    it('does not keep anything of the refused submission', async () => {
      const world = createWorld();
      const keptBefore = (await listScores(world.app)).length;

      await scenario.attempt(world);

      // Scenarios that need an earlier, accepted submission leave exactly that one behind.
      const accepted = ['session_already_used', 'duplicate_replay'].includes(scenario.code) ? 1 : 0;
      expect((await listScores(world.app)).length - keptBefore).toBe(accepted);
    });

    if (scenario.sessionStaysUsable) {
      it('leaves the session free for a submission that is in order', async () => {
        const world = createWorld();
        const { request } = await scenario.attempt(world);
        const { sessionId } = request as { sessionId?: string };
        const session = sessionId ?? (await startSession(world.app));

        const response = await submitScore(world, session, 'ACE', 10);

        expect(response.status).toBe(201);
      });
    }
  });

  it('refuses initials whatever digits are standing in for letters', async () => {
    const world = createWorld();
    const sessionId = await startSession(world.app);

    await expectApiError(await submitScore(world, sessionId, 'A55', 10), 422, 'initials_not_allowed');
    await expectApiError(await submitScore(world, sessionId, 'S3X', 10), 422, 'initials_not_allowed');
    expect((await submitScore(world, sessionId, 'ACE', 10)).status).toBe(201);
  });
});

describe('with the real engine', () => {
  const mouseRun = GOLDEN_RUNS[1];

  function realWorld() {
    const clock = new ManualClock();
    const store = new InMemoryLeaderboardStore();
    const service = new LeaderboardService({
      store,
      clock,
      ids: new SequentialIdGenerator(),
      verifier: new EngineRunVerifier(),
    });
    return { app: createApp({ service, security: { clock } }), clock, store };
  }

  type RealWorld = ReturnType<typeof realWorld>;

  const durationMs = (ticks: number) => Math.ceil((ticks / TICKS_PER_SECOND) * 1000);

  /** A session that has existed for as long as it took to play `ticks` ticks. */
  async function sessionPlayedFor(world: RealWorld, ticks: number): Promise<string> {
    const sessionId = await startSession(world.app);
    world.clock.advance(durationMs(ticks));
    return sessionId;
  }

  function submitRun(world: RealWorld, sessionId: string, overrides: Partial<SubmitScoreRequest> = {}) {
    const request: SubmitScoreRequest = {
      sessionId,
      initials: 'ACE',
      score: mouseRun.score,
      engineVersion: ENGINE_VERSION,
      replay: [...mouseRun.replay],
      ...overrides,
    };
    return send(world.app, 'POST', '/api/scores', request);
  }

  let consoleWarn: MockInstance;

  beforeEach(() => {
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleWarn.mockRestore();
  });

  it('keeps the score of a golden run, as the engine plays it', async () => {
    const world = realWorld();
    const sessionId = await sessionPlayedFor(world, mouseRun.ticks);

    const response = await submitRun(world, sessionId);

    expect(response.status).toBe(201);
    expect(((await response.json()) as SubmitScoreResponse).entry).toMatchObject({ rank: 1, initials: 'ACE', score: mouseRun.score });
    expect(await listScores(world.app)).toHaveLength(1);
  });

  it.each(GOLDEN_RUNS)('accepts the golden run "$name" with the score it was recorded with', async (run) => {
    const world = realWorld();
    const sessionId = await sessionPlayedFor(world, run.ticks);

    const response = await submitRun(world, sessionId, { score: run.score, replay: [...run.replay] });

    expect(response.status).toBe(201);
    expect(((await response.json()) as SubmitScoreResponse).entry.score).toBe(run.score);
  });

  it('refuses the same game on another session as a duplicate, and leaves that session free', async () => {
    const world = realWorld();
    const other = GOLDEN_RUNS[0];
    await submitRun(world, await sessionPlayedFor(world, mouseRun.ticks));
    // Old enough for either game, as the retry below is a longer one.
    const second = await sessionPlayedFor(world, Math.max(mouseRun.ticks, other.ticks));

    await expectApiError(await submitRun(world, second), 409, 'duplicate_replay');

    const retry = await submitRun(world, second, { score: other.score, replay: [...other.replay] });
    expect(retry.status).toBe(201);
  });

  describe('when the same game is written down another way', () => {
    const noisy = GOLDEN_RUNS[2];
    // The last run of this golden run lies in the explosion of the cannons, when every control is ignored: left and
    // right held together are another way to say nothing, and so is anything else that differs from what was held.
    const [lastControls, lastTicks] = noisy.replay.slice(-2) as [number, number];
    const otherSpelling = [...noisy.replay.slice(0, -2), lastControls === 3 ? 12 : 3, lastTicks];

    function submitNoisy(world: RealWorld, sessionId: string, replay: readonly number[]) {
      return submitRun(world, sessionId, { score: noisy.score, replay: [...replay] });
    }

    it('is a well-formed replay of the same length', () => {
      expect(otherSpelling).not.toEqual(noisy.replay);
      expect(replayProblem(otherSpelling)).toBeNull();
      expect(replayTicks(otherSpelling)).toBe(noisy.ticks);
    });

    it('is refused as the same game, and leaves its session free', async () => {
      const world = realWorld();
      expect((await submitNoisy(world, await sessionPlayedFor(world, noisy.ticks), noisy.replay)).status).toBe(201);
      const second = await sessionPlayedFor(world, noisy.ticks);

      await expectApiError(await submitNoisy(world, second, otherSpelling), 409, 'duplicate_replay');

      // The shortest golden run, as the session is only as old as the noisy one is long.
      const other = GOLDEN_RUNS[3];
      const retry = await submitRun(world, second, { score: other.score, replay: [...other.replay] });
      expect(retry.status).toBe(201);
    });

    it('is kept as the engine played it, which is the same for both spellings', async () => {
      const world = realWorld();
      const played = new EngineRunVerifier().verify(noisy.replay);
      if (!played.ok) throw new Error('The golden run has to be a finished game.');

      await submitNoisy(world, await sessionPlayedFor(world, noisy.ticks), otherSpelling);

      const [stored] = [...world.store.storedRuns()];
      expect(stored?.replay).toEqual(played.effective);
      expect(stored?.replay).not.toEqual(otherSpelling);
    });
  });

  it('refuses a score other than the one the game gives', async () => {
    const world = realWorld();
    const sessionId = await sessionPlayedFor(world, mouseRun.ticks);

    await expectApiError(await submitRun(world, sessionId, { score: mouseRun.score + 1 }), 422, 'score_mismatch');
    await expectApiError(await submitRun(world, sessionId, { score: mouseRun.score - 1 }), 422, 'score_mismatch');
    expect(await listScores(world.app)).toEqual([]);
  });

  it('refuses a game with its last stretch cut off, as it is not a finished game', async () => {
    const world = realWorld();
    const sessionId = await sessionPlayedFor(world, mouseRun.ticks);

    await expectApiError(
      await submitRun(world, sessionId, { replay: mouseRun.replay.slice(0, -2) }),
      422,
      'invalid_replay',
    );
  });

  it('refuses a game that goes on after it was over', async () => {
    const world = realWorld();
    const sessionId = await sessionPlayedFor(world, mouseRun.ticks + 60);

    await expectApiError(
      await submitRun(world, sessionId, { replay: [...mouseRun.replay, 31, 30] }),
      422,
      'invalid_replay',
    );
  });

  it('refuses a recording made by another version of the rules', async () => {
    const world = realWorld();
    const sessionId = await sessionPlayedFor(world, mouseRun.ticks);

    await expectApiError(await submitRun(world, sessionId, { engineVersion: 0 }), 409, 'outdated_client');
  });

  it('refuses a recording longer than the session is old, and accepts it once the session is', async () => {
    const world = realWorld();
    const sessionId = await sessionPlayedFor(world, mouseRun.ticks / 2);

    await expectApiError(await submitRun(world, sessionId), 422, 'implausible_score');

    world.clock.advance(durationMs(mouseRun.ticks / 2));
    expect((await submitRun(world, sessionId)).status).toBe(201);
  });

  it('refuses a recording that is empty, as a malformed request', async () => {
    const world = realWorld();
    const sessionId = await sessionPlayedFor(world, mouseRun.ticks);

    await expectApiError(await submitRun(world, sessionId, { replay: [] }), 400, 'invalid_request');
  });
});
