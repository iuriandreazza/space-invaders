import { useEffect, useEffectEvent, useState } from 'react';
import type { ConsentDecision } from '../application/ports.ts';
import type { ConsentCopy } from './consentCopy.ts';

/** How long a first-time visitor who does not touch the banner has before it accepts for them. */
export const CONSENT_AUTO_ACCEPT_SECONDS = 5;

interface ConsentBannerProps {
  copy: ConsentCopy;
  /** What the visitor chose before, or null on a first visit. */
  decision: ConsentDecision | null;
  /** Whether an untouched banner accepts by itself. Only a first visit is counted down: one who comes back is there to choose. */
  isCountdownDue: boolean;
  onChoose: (decision: ConsentDecision) => void;
  onAcceptAutomatically: () => void;
}

export function ConsentBanner({ copy, decision, isCountdownDue, onChoose, onAcceptAutomatically }: ConsentBannerProps) {
  const [secondsLeft, setSecondsLeft] = useState(CONSENT_AUTO_ACCEPT_SECONDS);
  const [isStopped, setIsStopped] = useState(false);
  const isCountingDown = isCountdownDue && !isStopped;
  const acceptAutomatically = useEffectEvent(onAcceptAutomatically);

  useEffect(() => {
    if (!isCountingDown) return;
    const ticker = setInterval(() => setSecondsLeft((left) => Math.max(left - 1, 0)), 1000);
    const deadline = setTimeout(() => acceptAutomatically(), CONSENT_AUTO_ACCEPT_SECONDS * 1000);
    return () => {
      clearInterval(ticker);
      clearTimeout(deadline);
    };
  }, [isCountingDown]);

  // Whoever opens the details or moves to a button is reading: a timer must not decide for them.
  const stopCountdown = () => setIsStopped(true);
  const choose = (choice: ConsentDecision) => {
    stopCountdown();
    onChoose(choice);
  };

  return (
    <div className="consent" role="region" aria-label={copy.regionLabel} lang={copy.lang} onFocus={stopCountdown}>
      <div className="consent__text">
        <p>{copy.message}</p>
        <details className="consent__details">
          <summary onClick={stopCountdown}>{copy.detailsSummary}</summary>
          <ul>
            {copy.details.map(({ topic, text }) => (
              <li key={topic}>
                <strong>{topic}.</strong> {text}
              </li>
            ))}
          </ul>
        </details>
      </div>
      <div className="consent__actions">
        {isCountingDown && <p className="consent__status">{copy.countdown(secondsLeft)}</p>}
        {decision !== null && <p className="consent__status">{copy.current[decision]}</p>}
        <div className="consent__buttons">
          {/* Same look on purpose: declining must be as easy to see and to press as accepting. */}
          <button type="button" className="button button--small" onClick={() => choose('accepted')}>
            {copy.accept}
          </button>
          <button type="button" className="button button--small" onClick={() => choose('declined')}>
            {copy.decline}
          </button>
        </div>
      </div>
      {/* The countdown changes every second, which a screen reader must not read out: it hears this once instead. */}
      <span className="visually-hidden" aria-live="polite">
        {isCountingDown && secondsLeft < CONSENT_AUTO_ACCEPT_SECONDS ? copy.countdownNotice : ''}
      </span>
    </div>
  );
}
