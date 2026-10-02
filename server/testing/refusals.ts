import { ENGINE_VERSION } from '../../shared/game/replay.ts';
import type { ApiErrorCode, SubmitScoreRequest } from '../../shared/leaderboard-contract.ts';
import { buildSubmitScoreRequest } from './requests.ts';
import { send, startSession, type World } from './world.ts';

/** What a scenario sent last, and how the API answered it. */
export interface Attempt {
  readonly request: unknown;
  readonly response: Response;
}

/** One way of getting a submission refused. */
export interface RefusalScenario {
  readonly name: string;
  readonly code: ApiErrorCode;
  /** True when the refused body was a well-formed submission, so that it was about a session and a recording. */
  readonly isSubmission: boolean;
  /** Whether the session the refused attempt used stays free for another submission. */
  readonly sessionStaysUsable: boolean;
  attempt(world: World): Promise<Attempt>;
}

/** A submission that the fake verifier takes for a finished game scoring 10. */
function run(world: World, sessionId: string, overrides: Partial<SubmitScoreRequest> = {}): SubmitScoreRequest {
  const replay = overrides.replay ?? world.verifier.recordRun(10);
  return buildSubmitScoreRequest({ sessionId, score: 10, ...overrides, replay });
}

async function submit(world: World, request: unknown): Promise<Attempt> {
  return { request, response: await send(world.app, 'POST', '/api/scores', request) };
}

/** Starts a session, then makes the attempt with a submission built for it. */
async function inFreshSession(world: World, overrides: Partial<SubmitScoreRequest>): Promise<Attempt> {
  const sessionId = await startSession(world.app);
  return await submit(world, run(world, sessionId, overrides));
}

export const REFUSAL_SCENARIOS: readonly RefusalScenario[] = [
  {
    name: 'a body that is not a submission',
    code: 'invalid_request',
    isSubmission: false,
    sessionStaysUsable: true,
    attempt: (world) => submit(world, { not: 'a submission' }),
  },
  {
    name: 'a session that was never issued',
    code: 'unknown_session',
    isSubmission: true,
    sessionStaysUsable: false,
    attempt: (world) => submit(world, run(world, 'never-issued')),
  },
  {
    name: 'a session that has submitted already',
    code: 'session_already_used',
    isSubmission: true,
    sessionStaysUsable: false,
    attempt: async (world) => {
      const sessionId = await startSession(world.app);
      await submit(world, run(world, sessionId));
      return await submit(world, run(world, sessionId));
    },
  },
  {
    name: 'a recording made by another version of the game',
    code: 'outdated_client',
    isSubmission: true,
    sessionStaysUsable: true,
    attempt: (world) => inFreshSession(world, { engineVersion: ENGINE_VERSION + 1 }),
  },
  {
    name: 'a recording that is already on the board',
    code: 'duplicate_replay',
    isSubmission: true,
    sessionStaysUsable: true,
    attempt: async (world) => {
      const replay = world.verifier.recordRun(10);
      await submit(world, run(world, await startSession(world.app), { replay }));
      return await submit(world, run(world, await startSession(world.app), { replay }));
    },
  },
  {
    name: 'a recording that does not end in a game over',
    code: 'invalid_replay',
    isSubmission: true,
    sessionStaysUsable: true,
    attempt: (world) => inFreshSession(world, { replay: world.verifier.recordFailure('continued_after_game_over') }),
  },
  {
    name: 'a score the recording does not give',
    code: 'score_mismatch',
    isSubmission: true,
    sessionStaysUsable: true,
    attempt: (world) => inFreshSession(world, { score: 20 }),
  },
  {
    name: 'a recording longer than its session is old',
    code: 'implausible_score',
    isSubmission: true,
    sessionStaysUsable: true,
    attempt: (world) =>
      inFreshSession(world, { replay: world.verifier.acceptAs([1, 1, 2, 7200], 10) }),
  },
  {
    name: 'initials that are not allowed',
    code: 'initials_not_allowed',
    isSubmission: true,
    sessionStaysUsable: true,
    attempt: (world) => inFreshSession(world, { initials: 'ASS' }),
  },
];
