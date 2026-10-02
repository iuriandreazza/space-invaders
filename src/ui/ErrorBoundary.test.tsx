// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary.tsx';

afterEach(cleanup);

function Broken(): never {
  throw new Error('no canvas');
}

describe('ErrorBoundary', () => {
  it('shows what is inside while nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('fine')).toBeTruthy();
  });

  it('replaces a crashed screen with a way to reload, and logs the cause', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert').textContent).toMatch(/something went wrong/i);
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy();
    expect(log).toHaveBeenCalledWith('Space Invaders stopped:', expect.any(Error), expect.any(String));
    log.mockRestore();
  });
});
