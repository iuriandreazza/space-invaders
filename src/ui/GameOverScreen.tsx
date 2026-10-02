import { useEffect, useState, type FormEvent } from 'react';
import type { LeaderboardEntry } from '../../shared/leaderboard-contract.ts';
import { isInitialsAllowed } from '../../shared/blocked-initials.ts';
import { INITIALS_LENGTH } from '../../shared/initials.ts';
import { LeaderboardError, type RunResult } from '../application/ports.ts';
import { InitialsInput } from './InitialsInput.tsx';
import { Leaderboard } from './Leaderboard.tsx';
import { formatScore } from './LeaderboardTable.tsx';
import type { AppServices } from './services.ts';
import { useHotkeys } from './useHotkeys.ts';

interface GameOverScreenProps {
  services: AppServices;
  result: RunResult;
  /** Resolves to the id the score must be saved with, or null when the leaderboard was unreachable. */
  session: Promise<string | null>;
  onPlayAgain: () => void;
  onExit: () => void;
}

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; entry: LeaderboardEntry }
  | { status: 'failed'; message: string };

const INITIALS_NOT_ALLOWED = 'Those initials are not allowed. Pick others.';

function describeSaveError(error: unknown): string {
  if (!(error instanceof LeaderboardError)) return 'The score could not be saved.';
  switch (error.code) {
    case 'network':
      return 'The leaderboard cannot be reached. Check your connection and try again.';
    case 'session_already_used':
    case 'duplicate_replay':
      return 'This score was already saved.';
    case 'unknown_session':
      return 'This run has expired. Play again to save a score.';
    case 'implausible_score':
    case 'invalid_replay':
    case 'score_mismatch':
      return 'The leaderboard could not verify this run, so it was not saved.';
    case 'outdated_client':
      return 'The game was updated while you were playing. Reload the page to play the new version.';
    case 'initials_not_allowed':
      return INITIALS_NOT_ALLOWED;
    case 'rate_limited':
      return 'Too many attempts. Wait a moment and try again.';
    case 'payload_too_large':
      return 'This run is too long to be saved.';
    default:
      return 'The score could not be saved.';
  }
}

/** The session id once it is known: undefined while pending, null when there is none. */
function useSessionId(session: Promise<string | null>): string | null | undefined {
  const [resolved, setResolved] = useState<{ session: Promise<string | null>; id: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void session.then((id) => {
      if (!cancelled) setResolved({ session, id });
    });
    return () => {
      cancelled = true;
    };
  }, [session]);
  return resolved?.session === session ? resolved.id : undefined;
}

export function GameOverScreen({ services, result, session, onPlayAgain, onExit }: GameOverScreenProps) {
  const { score } = result;
  const sessionId = useSessionId(session);
  const [initials, setInitials] = useState(() => services.preferences.loadInitials());
  const [save, setSave] = useState<SaveState>({ status: 'idle' });
  const isSaving = save.status === 'saving';

  const isInitialsComplete = initials.length === INITIALS_LENGTH;
  const isInitialsRefused = isInitialsComplete && !isInitialsAllowed(initials);
  const canSave = isInitialsComplete && !isInitialsRefused && !isSaving;

  const isFormShown = score > 0 && typeof sessionId === 'string' && save.status !== 'saved';
  // While the form is open, Enter belongs to it. Space is never bound here: players are still hammering the fire
  // button when the game ends, and would skip the score form without noticing.
  useHotkeys(isFormShown ? {} : { Enter: onPlayAgain });

  function changeInitials(next: string) {
    setInitials(next);
    // The reason for a failed save was about the old initials.
    if (save.status === 'failed') setSave({ status: 'idle' });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (typeof sessionId !== 'string' || !canSave) return;

    setSave({ status: 'saving' });
    try {
      const entry = await services.leaderboard.submitScore({ sessionId, initials, run: result });
      services.preferences.saveInitials(initials);
      setSave({ status: 'saved', entry });
    } catch (error) {
      setSave({ status: 'failed', message: describeSaveError(error) });
    }
  }

  return (
    <main className="screen gameover">
      <h1 className="logo logo--small">Game over</h1>
      <p className="final-score">
        Score <strong>{formatScore(score)}</strong>
      </p>

      {score === 0 && <p className="muted">Shoot a few invaders to make the board.</p>}
      {score > 0 && sessionId === undefined && (
        <p className="muted" role="status">
          Contacting the leaderboard…
        </p>
      )}
      {score > 0 && sessionId === null && (
        <p className="muted" role="status">
          The leaderboard is unavailable, so this score cannot be saved.
        </p>
      )}

      {isFormShown && (
        <form className="panel save" onSubmit={handleSubmit}>
          <label htmlFor="initials">Enter your initials</label>
          <InitialsInput value={initials} onChange={changeInitials} disabled={isSaving} />
          <button type="submit" className="button button--primary" disabled={!canSave}>
            {isSaving ? 'Saving…' : 'Save score'}
          </button>
          {isInitialsRefused && (
            <p role="status" className="error">
              {INITIALS_NOT_ALLOWED}
            </p>
          )}
          {save.status === 'failed' && (
            <p role="alert" className="error">
              {save.message}
            </p>
          )}
        </form>
      )}

      {save.status === 'saved' && (
        <section className="panel">
          <p role="status" className="rank">
            You placed #{save.entry.rank}!
          </p>
          <Leaderboard leaderboard={services.leaderboard} highlight={save.entry} />
        </section>
      )}

      <div className="actions">
        {/* Leaving while the score is on its way would hide whether it was saved. */}
        <button type="button" className="button button--primary" onClick={onPlayAgain} disabled={isSaving}>
          Play again
        </button>
        <button type="button" className="button" onClick={onExit} disabled={isSaving}>
          Title screen
        </button>
      </div>
    </main>
  );
}
