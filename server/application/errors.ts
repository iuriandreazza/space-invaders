import type { RunFailureReason } from './ports.ts';

// The messages are shown to players, so they say what was refused and never why in more detail than the error code.

export class UnknownSessionError extends Error {
  constructor() {
    super('Unknown play session.');
  }
}

export class SessionAlreadyUsedError extends Error {
  constructor() {
    super('This play session has already submitted a score.');
  }
}

export class InitialsNotAllowedError extends Error {
  constructor() {
    super('Those initials are not allowed.');
  }
}

export class OutdatedClientError extends Error {
  constructor() {
    super('This version of the game is out of date. Reload the page to play the current one.');
  }
}

export class ImplausibleScoreError extends Error {
  constructor() {
    super('The run is not plausible for the time played.');
  }
}

export class InvalidReplayError extends Error {
  /** Kept for the logs; it is never sent to the client. */
  readonly reason: RunFailureReason;

  constructor(reason: RunFailureReason) {
    super('The recording of the run could not be verified.');
    this.reason = reason;
  }
}

export class ScoreMismatchError extends Error {
  constructor() {
    super('The recording does not match the submitted score.');
  }
}

export class DuplicateReplayError extends Error {
  constructor() {
    super('This run has already been submitted.');
  }
}
