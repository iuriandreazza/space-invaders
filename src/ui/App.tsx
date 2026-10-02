import { useState } from 'react';
import type { RunResult } from '../application/ports.ts';
import { ConsentBanner } from './ConsentBanner.tsx';
import { GameOverScreen } from './GameOverScreen.tsx';
import { GameScreen } from './GameScreen.tsx';
import { SiteFooter } from './SiteFooter.tsx';
import { TitleScreen } from './TitleScreen.tsx';
import type { AppServices } from './services.ts';
import { useConsent } from './useConsent.ts';

type Screen =
  | { name: 'title' }
  | { name: 'playing'; session: Promise<string | null> }
  | { name: 'gameOver'; result: RunResult; session: Promise<string | null> };

export function App({ services }: { services: AppServices }) {
  const consent = useConsent(services.consent, services.analytics);

  // The footer and the consent banner belong to the page, not to a screen: they stay while a game is played.
  return (
    <div className="app" data-consent-open={consent.isBannerOpen}>
      <Screens services={services} />
      <SiteFooter onOpenCookieSettings={consent.reopen} />
      {consent.isBannerOpen && (
        <ConsentBanner
          copy={consent.copy}
          decision={consent.decision}
          isCountdownDue={consent.isCountdownDue}
          onChoose={consent.choose}
          onAcceptAutomatically={consent.acceptAutomatically}
        />
      )}
      <p className="visually-hidden" aria-live="polite" lang={consent.copy.lang}>
        {consent.announcement}
      </p>
    </div>
  );
}

function Screens({ services }: { services: AppServices }) {
  const [screen, setScreen] = useState<Screen>({ name: 'title' });

  // The run is registered with the leaderboard as it starts. If that fails the game is still playable, only not rankable.
  const startRun = () =>
    setScreen({ name: 'playing', session: services.leaderboard.startSession().catch(() => null) });

  switch (screen.name) {
    case 'title':
      return <TitleScreen services={services} onStart={startRun} />;
    case 'playing':
      return (
        <GameScreen
          services={services}
          onGameOver={(result) => setScreen({ name: 'gameOver', result, session: screen.session })}
        />
      );
    case 'gameOver':
      return (
        <GameOverScreen
          services={services}
          result={screen.result}
          session={screen.session}
          onPlayAgain={startRun}
          onExit={() => setScreen({ name: 'title' })}
        />
      );
  }
}
