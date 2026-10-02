import { useEffect, useState } from 'react';
import type { AnalyticsPort, ConsentDecision, ConsentStore } from '../application/ports.ts';
import { getConsentCopy } from './consentCopy.ts';

/**
 * What the visitor agreed to, and whether the banner that asks is on screen. This is the one place where the decision
 * reaches the tracker, for a saved decision and a new one alike: it starts for a visitor who accepted, also on a later
 * visit, and stops for one who declined.
 */
export function useConsent(store: ConsentStore, analytics: AnalyticsPort) {
  const [decision, setDecision] = useState(() => store.load());
  const [isBannerOpen, setIsBannerOpen] = useState(decision === null);
  const [announcement, setAnnouncement] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [copy] = useState(() => getConsentCopy());

  useEffect(() => {
    if (decision === 'accepted') analytics.start();
    else if (decision === 'declined') analytics.stop();
  }, [decision, analytics]);

  function decide(next: ConsentDecision, announced: string) {
    store.save(next);
    setDecision(next);
    setIsBannerOpen(false);
    setAnnouncement(announced);
  }

  return {
    copy,
    isBannerOpen,
    decision,
    /** A visitor who asked to see the settings is there to choose, even on a first visit: a timer must not opt them in. */
    isCountdownDue: decision === null && !isReviewing,
    announcement,
    choose: (next: ConsentDecision) => decide(next, ''),
    acceptAutomatically: () => decide('accepted', copy.autoAccepted),
    reopen: () => {
      setIsReviewing(true);
      setAnnouncement('');
      setIsBannerOpen(true);
    },
  };
}
