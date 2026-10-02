// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createAnalytics, createSound } from './compositionRoot.ts';
import { silentAnalytics } from './infrastructure/browser/silentAnalytics.ts';
import { silentSound } from './infrastructure/audio/silentSound.ts';

afterEach(() => {
  document.head.querySelectorAll('script').forEach((script) => script.remove());
  delete (window as { dataLayer?: unknown }).dataLayer;
});

describe('createSound', () => {
  it('falls back to silence in a browser that cannot make sound', () => {
    expect('AudioContext' in globalThis).toBe(false);
    expect(createSound()).toBe(silentSound);
  });
});

describe('createAnalytics', () => {
  it('counts nothing outside the built site, so that `pnpm dev` does not pollute the numbers', () => {
    expect(import.meta.env.PROD).toBe(false);
    expect(createAnalytics()).toBe(silentAnalytics);
    expect(createAnalytics('G-TEST123', false)).toBe(silentAnalytics);
  });

  it('counts nothing in a build that was not given a measurement id', () => {
    expect(createAnalytics('', true)).toBe(silentAnalytics);
  });

  it('counts visits to the built site, in the property it was given, once started', () => {
    const analytics = createAnalytics('G-TEST123', true);
    expect(document.head.querySelector('script')).toBeNull();

    analytics.start();

    expect(document.head.querySelector('script')?.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST123');
  });
});
