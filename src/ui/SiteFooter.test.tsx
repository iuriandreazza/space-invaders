// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CREDITS, SiteFooter } from './SiteFooter.tsx';

afterEach(cleanup);

describe('SiteFooter', () => {
  it('links to the three sites, in a new tab and without handing over the opener', () => {
    render(<SiteFooter onOpenCookieSettings={vi.fn()} />);

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://iuriandreazza.com.br',
      'https://nous.biz',
      'https://zeroserver.cc',
    ]);
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    }
  });

  it('shows the icon of every site, from a file that is really served', () => {
    const { container } = render(<SiteFooter onOpenCookieSettings={vi.fn()} />);

    const sources = [...container.querySelectorAll('img')].map((image) => image.getAttribute('src')!);
    expect(sources).toEqual(CREDITS.map(({ icon }) => icon));
    for (const source of sources) {
      expect(existsSync(join(process.cwd(), 'public', source)), `public${source} is missing`).toBe(true);
    }
  });

  it('keeps the icons decorative, as the name next to each one already says what the link is', () => {
    const { container } = render(<SiteFooter onOpenCookieSettings={vi.fn()} />);
    for (const image of container.querySelectorAll('img')) expect(image.getAttribute('alt')).toBe('');
  });

  it('reopens the cookie settings, which is how a visitor changes their mind', () => {
    const onOpenCookieSettings = vi.fn();
    render(<SiteFooter onOpenCookieSettings={onOpenCookieSettings} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cookie settings' }));

    expect(onOpenCookieSettings).toHaveBeenCalledTimes(1);
  });

  it('says that the game is a fan-made tribute and not affiliated with Taito', () => {
    render(<SiteFooter onOpenCookieSettings={vi.fn()} />);
    expect(screen.getByText(/fan-made tribute/i).textContent).toMatch(/Not affiliated with or endorsed by Taito/);
  });
});
