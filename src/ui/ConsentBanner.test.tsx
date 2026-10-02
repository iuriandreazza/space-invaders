// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsentDecision } from '../application/ports.ts';
import { CONSENT_AUTO_ACCEPT_SECONDS, ConsentBanner } from './ConsentBanner.tsx';
import { CONSENT_COPY, type ConsentCopy } from './consentCopy.ts';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

interface Visit {
  decision?: ConsentDecision | null;
  isCountdownDue?: boolean;
  copy?: ConsentCopy;
}

function show({ decision = null, isCountdownDue = decision === null, copy = CONSENT_COPY.en }: Visit = {}) {
  const onChoose = vi.fn();
  const onAcceptAutomatically = vi.fn();
  const view = render(
    <ConsentBanner
      copy={copy}
      decision={decision}
      isCountdownDue={isCountdownDue}
      onChoose={onChoose}
      onAcceptAutomatically={onAcceptAutomatically}
    />,
  );
  return { ...view, onChoose, onAcceptAutomatically };
}

const waitMs = (milliseconds: number): void => {
  act(() => void vi.advanceTimersByTime(milliseconds));
};
const wait = (seconds: number): void => waitMs(seconds * 1000);
const countdown = () => screen.queryByText(/accepting automatically in/i);
const liveRegion = (container: HTMLElement) => container.querySelector('[aria-live="polite"]')!;

describe('the consent banner', () => {
  it('waits five seconds, as the product owner asked', () => {
    expect(CONSENT_AUTO_ACCEPT_SECONDS).toBe(5);
  });

  it('is a labelled region with Accept and Decline', () => {
    show();

    expect(screen.getByRole('region', { name: 'Cookie consent' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy();
  });

  it('says what is asked, and what is collected, in the details', () => {
    show();

    expect(screen.getByText(/google analytics cookies.*LGPD, Brazilian Law 13\.709\/2018/i)).toBeTruthy();
    const details = screen.getByText('What is collected?').closest('details')!;
    expect(details.hasAttribute('open')).toBe(false);
    expect(details.textContent).toMatch(/google analytics sets cookies and identifiers/i);
    expect(details.textContent).toMatch(/three letters \(your initials\), the score and the date/i);
    expect(details.textContent).toMatch(/no account and no email/i);
    expect(details.textContent).toMatch(/ip address is used only in memory.*not stored/i);
  });

  it('does not take the focus, so that Enter and Space still start the game', () => {
    const { container } = show();

    expect(document.activeElement).toBe(document.body);
    expect(container.querySelector('[autofocus]')).toBeNull();
  });

  it('keeps Accept and Decline looking alike, so that neither is pushed', () => {
    show();
    expect(screen.getByRole('button', { name: 'Accept' }).className).toBe(screen.getByRole('button', { name: 'Decline' }).className);
  });

  describe('for a visitor who has not chosen yet', () => {
    it('counts down on screen', () => {
      show();
      expect(countdown()?.textContent).toBe('Accepting automatically in 5s');

      wait(3);

      expect(countdown()?.textContent).toBe('Accepting automatically in 2s');
    });

    it('accepts for them once the countdown ends, and only then', () => {
      const { onAcceptAutomatically, onChoose } = show();

      waitMs(CONSENT_AUTO_ACCEPT_SECONDS * 1000 - 1);
      expect(onAcceptAutomatically).not.toHaveBeenCalled();

      waitMs(1);
      expect(onAcceptAutomatically).toHaveBeenCalledTimes(1);
      expect(onChoose).not.toHaveBeenCalled();

      wait(60);
      expect(onAcceptAutomatically).toHaveBeenCalledTimes(1);
    });

    it('does not accept for them once they have opened the details', () => {
      const { onAcceptAutomatically } = show();
      wait(2);

      fireEvent.click(screen.getByText('What is collected?'));
      wait(60);

      expect(onAcceptAutomatically).not.toHaveBeenCalled();
      expect(countdown()).toBeNull();
    });

    it.each(['Accept', 'Decline'])('does not accept for them once the %s button has the focus', (name) => {
      const { onAcceptAutomatically } = show();

      act(() => screen.getByRole('button', { name }).focus());
      wait(60);

      expect(onAcceptAutomatically).not.toHaveBeenCalled();
      expect(countdown()).toBeNull();
    });

    it('does not accept for them once the details have the keyboard focus', () => {
      const { onAcceptAutomatically } = show();

      act(() => screen.getByText('What is collected?').focus());
      wait(60);

      expect(onAcceptAutomatically).not.toHaveBeenCalled();
    });

    it('records what they press, without the countdown', () => {
      const accepted = show();
      fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
      expect(accepted.onChoose).toHaveBeenCalledExactlyOnceWith('accepted');
      cleanup();

      const declined = show();
      fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
      expect(declined.onChoose).toHaveBeenCalledExactlyOnceWith('declined');
      wait(60);
      expect(declined.onAcceptAutomatically).not.toHaveBeenCalled();
    });

    it('stops its clock when it goes away', () => {
      const { onAcceptAutomatically, unmount } = show();

      unmount();
      wait(60);

      expect(onAcceptAutomatically).not.toHaveBeenCalled();
    });
  });

  describe('for a visitor who comes back to change their choice', () => {
    it.each([
      ['accepted', 'Analytics are on.'],
      ['declined', 'Analytics are off.'],
    ] as const)('shows what they chose (%s) and never counts down', (decision, status) => {
      const { onAcceptAutomatically } = show({ decision });

      wait(60);

      expect(screen.getByText(status)).toBeTruthy();
      expect(countdown()).toBeNull();
      expect(onAcceptAutomatically).not.toHaveBeenCalled();
    });

    it('lets them choose again', () => {
      const { onChoose } = show({ decision: 'accepted' });
      fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
      expect(onChoose).toHaveBeenCalledExactlyOnceWith('declined');
    });
  });

  describe('for a screen reader', () => {
    it('is not an alert, which would interrupt whatever is being read', () => {
      show();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('hears about the countdown once, politely, and not every second', () => {
      const { container } = show();
      expect(liveRegion(container).textContent).toBe('');

      wait(1);
      const announcement = liveRegion(container).textContent;
      expect(announcement).toMatch(/accepted automatically in a few seconds/i);

      wait(3);
      expect(liveRegion(container).textContent).toBe(announcement);
      expect(liveRegion(container).contains(countdown())).toBe(false);
    });

    it('hears nothing more once the countdown is stopped', () => {
      const { container } = show();
      wait(1);

      fireEvent.click(screen.getByText('What is collected?'));

      expect(liveRegion(container).textContent).toBe('');
    });
  });

  describe('in Portuguese', () => {
    it('speaks it, and says so to screen readers', () => {
      show({ copy: CONSENT_COPY['pt-BR'] });

      const region = screen.getByRole('region', { name: 'Consentimento de cookies' });
      expect(region.getAttribute('lang')).toBe('pt-BR');
      expect(region.textContent).toMatch(/Usamos cookies do Google Analytics para entender como o jogo é usado/);
      expect(region.textContent).toMatch(/LGPD, Lei 13\.709\/2018/);
      expect(region.textContent).toMatch(/Aceitando automaticamente em 5s/);
      expect(screen.getByRole('button', { name: 'Aceitar' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Recusar' })).toBeTruthy();
      expect(screen.getByText('O que é coletado?')).toBeTruthy();
    });
  });
});
