// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsentDecision } from '../application/ports.ts';
import { App } from './App.tsx';
import { CONSENT_AUTO_ACCEPT_SECONDS } from './ConsentBanner.tsx';
import { createFakeServices } from './testSupport.ts';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const banner = () => screen.queryByRole('region', { name: /cookie consent|consentimento de cookies/i });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const wait = (seconds: number): void => {
  act(() => void vi.advanceTimersByTime(seconds * 1000));
};

/** Opens the page as a visitor with the given saved decision; the scores of the title screen are let in first. */
async function visit(decision: ConsentDecision | null = null) {
  const setup = createFakeServices();
  setup.consent.decision = decision;
  render(<App services={setup.services} />);
  await act(async () => {});
  return setup;
}

describe('the consent banner in the app', () => {
  it('asks a first-time visitor, and starts or stops nothing until there is a decision', async () => {
    const { analytics, consent } = await visit();

    expect(banner()).not.toBeNull();
    expect(analytics.start).not.toHaveBeenCalled();
    expect(analytics.stop).not.toHaveBeenCalled();
    expect(consent.save).not.toHaveBeenCalled();
  });

  it('starts analytics when the visitor accepts, and remembers it', async () => {
    const { analytics, consent } = await visit();

    click('Accept');

    expect(analytics.start).toHaveBeenCalledTimes(1);
    expect(consent.save).toHaveBeenCalledExactlyOnceWith('accepted');
    expect(banner()).toBeNull();
  });

  it('never starts analytics for a visitor who declines, however long they stay', async () => {
    const { analytics, consent } = await visit();

    click('Decline');
    wait(CONSENT_AUTO_ACCEPT_SECONDS * 12);

    expect(analytics.start).not.toHaveBeenCalled();
    expect(analytics.stop).toHaveBeenCalled();
    expect(consent.save).toHaveBeenCalledExactlyOnceWith('declined');
    expect(banner()).toBeNull();
  });

  it('accepts for a visitor who leaves the banner alone, in the same way as a click', async () => {
    const { analytics, consent } = await visit();

    wait(CONSENT_AUTO_ACCEPT_SECONDS - 1);
    expect(analytics.start).not.toHaveBeenCalled();
    expect(banner()).not.toBeNull();

    wait(1);

    expect(analytics.start).toHaveBeenCalledTimes(1);
    expect(consent.save).toHaveBeenCalledExactlyOnceWith('accepted');
    expect(banner()).toBeNull();
  });

  it('tells screen readers that it accepted', async () => {
    await visit();
    const status = () => document.querySelector('p[aria-live="polite"]')!;
    expect(status().textContent).toBe('');

    wait(CONSENT_AUTO_ACCEPT_SECONDS);

    expect(status().textContent).toMatch(/accepted automatically/i);
  });

  it('says nothing of the sort when the visitor chose', async () => {
    await visit();
    click('Accept');
    expect(document.querySelector('p[aria-live="polite"]')!.textContent).toBe('');
  });

  it('does not accept for a visitor who is reading the details', async () => {
    const { analytics, consent } = await visit();

    fireEvent.click(screen.getByText('What is collected?'));
    wait(CONSENT_AUTO_ACCEPT_SECONDS * 12);

    expect(banner()).not.toBeNull();
    expect(analytics.start).not.toHaveBeenCalled();
    expect(consent.save).not.toHaveBeenCalled();
  });

  it('starts analytics at once for a visitor who accepted on an earlier visit, and does not ask again', async () => {
    const { analytics, consent } = await visit('accepted');

    expect(banner()).toBeNull();
    expect(analytics.start).toHaveBeenCalledTimes(1);
    expect(consent.save).not.toHaveBeenCalled();
  });

  it('keeps analytics off for a visitor who declined on an earlier visit, and does not ask again', async () => {
    const { analytics } = await visit('declined');

    expect(banner()).toBeNull();
    expect(analytics.start).not.toHaveBeenCalled();
  });

  it('stays while a game is played, without taking the keys of the game or its focus', async () => {
    const { games } = await visit();

    act(() => {
      fireEvent.keyDown(window, { code: 'Enter' });
    });

    expect(games).toHaveLength(1);
    expect(banner()).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('accepts once, not twice, when React runs every effect twice', async () => {
    const setup = createFakeServices();
    setup.consent.decision = null;
    render(
      <StrictMode>
        <App services={setup.services} />
      </StrictMode>,
    );
    await act(async () => {});

    wait(CONSENT_AUTO_ACCEPT_SECONDS * 3);

    expect(setup.consent.save).toHaveBeenCalledExactlyOnceWith('accepted');
    expect(banner()).toBeNull();
  });

  it('speaks Portuguese to a browser in Portuguese', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('pt-BR');

    await visit();

    expect(screen.getByRole('region', { name: 'Consentimento de cookies' }).textContent).toMatch(/Usamos cookies/);
    click('Recusar');
    expect(banner()).toBeNull();
  });
});

describe('changing the decision from the footer', () => {
  it('lets a visitor who accepted take it back, which stops analytics', async () => {
    const { analytics, consent } = await visit('accepted');

    click('Cookie settings');
    expect(screen.getByText('Analytics are on.')).toBeTruthy();
    click('Decline');

    expect(consent.save).toHaveBeenCalledExactlyOnceWith('declined');
    expect(analytics.stop).toHaveBeenCalled();
    expect(banner()).toBeNull();
  });

  it('lets a visitor who declined accept later, which starts analytics', async () => {
    const { analytics } = await visit('declined');

    click('Cookie settings');
    expect(screen.getByText('Analytics are off.')).toBeTruthy();
    click('Accept');

    expect(analytics.start).toHaveBeenCalledTimes(1);
  });

  it('never decides for a visitor who is only looking at it', async () => {
    const { analytics, consent } = await visit('declined');

    click('Cookie settings');
    wait(CONSENT_AUTO_ACCEPT_SECONDS * 12);

    expect(banner()).not.toBeNull();
    expect(screen.queryByText(/accepting automatically/i)).toBeNull();
    expect(analytics.start).not.toHaveBeenCalled();
    expect(consent.save).not.toHaveBeenCalled();
  });

  it('is there on every screen', async () => {
    const setup = await visit('accepted');
    act(() => {
      fireEvent.keyDown(window, { code: 'Enter' });
    });

    click('Cookie settings');

    expect(banner()).not.toBeNull();
    expect(setup.games).toHaveLength(1);
  });

  it('stops the countdown of a first-time visitor who asks to see the settings', async () => {
    const { analytics, consent } = await visit();
    wait(2);

    click('Cookie settings');
    wait(CONSENT_AUTO_ACCEPT_SECONDS * 12);

    expect(screen.getAllByRole('region', { name: /cookie consent/i })).toHaveLength(1);
    expect(screen.queryByText(/accepting automatically/i)).toBeNull();
    expect(analytics.start).not.toHaveBeenCalled();
    expect(consent.save).not.toHaveBeenCalled();
  });
});
