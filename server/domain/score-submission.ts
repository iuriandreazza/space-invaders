import { MAX_DISPLAYED_SCORE } from '../../shared/game/constants.ts';
import { replayProblem, type Replay } from '../../shared/game/replay.ts';
import { INITIALS_LENGTH, isValidInitials } from '../../shared/initials.ts';
import { invalid, valid, type Parsed } from './parsed.ts';

/** Generous for the ids we issue (22 characters), small enough that nobody can use the field to stuff data. */
export const MAX_SESSION_ID_LENGTH = 64;

export interface ScoreSubmission {
  readonly sessionId: string;
  readonly initials: string;
  /** What the player saw. The score that is kept comes from playing the replay again, and the two must be equal. */
  readonly score: number;
  readonly engineVersion: number;
  readonly replay: Replay;
}

/** Checks the shape of a submission only: whether it is a game worth keeping is for the use case to decide. */
export function parseScoreSubmission(input: unknown): Parsed<ScoreSubmission> {
  if (!isRecord(input)) {
    return invalid('Request body must be a JSON object.');
  }
  const { sessionId, initials, score, engineVersion, replay } = input;
  if (!isValidSessionId(sessionId)) {
    return invalid(`sessionId must be a non-empty string of at most ${MAX_SESSION_ID_LENGTH} characters.`);
  }
  // Rejected rather than normalised: the client is expected to send them already sanitised.
  if (!isValidInitials(initials)) {
    return invalid(`initials must be exactly ${INITIALS_LENGTH} characters, each an uppercase letter A-Z or a digit 0-9.`);
  }
  if (!isValidScore(score)) {
    return invalid(`score must be an integer between 1 and ${MAX_DISPLAYED_SCORE}.`);
  }
  if (!isInteger(engineVersion)) {
    return invalid('engineVersion must be an integer.');
  }
  // Last, as it is the only check that looks at every element.
  const problem = replayProblem(replay);
  if (problem !== null) {
    return invalid(problem);
  }
  // replayProblem returns null only for an array of the right shape.
  return valid({ sessionId, initials, score, engineVersion, replay: replay as Replay });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isValidSessionId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= MAX_SESSION_ID_LENGTH;
}

function isValidScore(value: unknown): value is number {
  return isInteger(value) && value >= 1 && value <= MAX_DISPLAYED_SCORE;
}
