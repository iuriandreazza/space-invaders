import { GameSession } from './application/gameSession.ts';
import type { AnalyticsPort, SoundPort } from './application/ports.ts';
import { silentSound } from './infrastructure/audio/silentSound.ts';
import { WebAudioSound } from './infrastructure/audio/webAudioSound.ts';
import { BrowserConsentStore } from './infrastructure/browser/browserConsentStore.ts';
import { BrowserPreferences } from './infrastructure/browser/browserPreferences.ts';
import { browserScheduler } from './infrastructure/browser/browserScheduler.ts';
import { GoogleAnalytics } from './infrastructure/browser/googleAnalytics.ts';
import { silentAnalytics } from './infrastructure/browser/silentAnalytics.ts';
import { CanvasRenderer } from './infrastructure/canvas/canvasRenderer.ts';
import { HttpLeaderboard } from './infrastructure/http/httpLeaderboard.ts';
import { AimInput } from './infrastructure/input/aimInput.ts';
import type { AppServices } from './ui/services.ts';

/**
 * Measurement id of the Google Analytics 4 property. It is public (it ends up in the page), and it is read when the
 * client is built: to turn analytics on, give the build `VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX` (CI passes it from the
 * repository variable `GA_MEASUREMENT_ID`). Empty keeps analytics off. Even with an id, nothing is loaded in
 * development, nor before the visitor accepts the consent banner.
 */
export const GOOGLE_ANALYTICS_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID ?? '';

export function createSound(): SoundPort {
  try {
    return new WebAudioSound();
  } catch {
    return silentSound;
  }
}

/** Only the built site counts, and only with an id: sessions of `pnpm dev` would pollute the numbers. */
export function createAnalytics(
  measurementId = GOOGLE_ANALYTICS_MEASUREMENT_ID,
  isProduction = import.meta.env.PROD,
): AnalyticsPort {
  return isProduction && measurementId !== '' ? new GoogleAnalytics(measurementId) : silentAnalytics;
}

/** The one place where ports meet their browser adapters. */
export function createServices(): AppServices {
  return {
    leaderboard: new HttpLeaderboard(),
    preferences: new BrowserPreferences(),
    consent: new BrowserConsentStore(),
    analytics: createAnalytics(),
    startGame: (canvas, onGameOver) => {
      // The controls go last: if anything before them fails, nothing is left listening on the window.
      const renderer = new CanvasRenderer(canvas);
      const sound = createSound();
      return new GameSession({ input: new AimInput(canvas), renderer, sound, scheduler: browserScheduler, onGameOver });
    },
  };
}
