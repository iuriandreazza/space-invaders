import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The site is built from `public/` and the server hands out what the build produced: a path that nothing backs is a 404 in production. */
const root = join(import.meta.dirname, '..', '..', '..');
const publicFile = (path: string): string => join(root, 'public', path);

describe('the static files the pages point to', () => {
  it('include every credit icon the footer shows', () => {
    const footer = readFileSync(join(root, 'src', 'ui', 'SiteFooter.tsx'), 'utf8');
    const icons = [...footer.matchAll(/icon: '(\/credits\/[^']+)'/g)].map((match) => match[1]!);

    expect(icons).toHaveLength(3);
    for (const icon of icons) {
      expect(existsSync(publicFile(icon)), `public${icon} is missing`).toBe(true);
    }
  });

  it('include the favicon that index.html names', () => {
    const page = readFileSync(join(root, 'index.html'), 'utf8');
    const favicon = /<link rel="icon"[^>]*href="(\/[^"]+)"/.exec(page)?.[1];

    expect(favicon, 'index.html names no favicon').toBeDefined();
    expect(existsSync(publicFile(favicon!)), `public${favicon} is missing`).toBe(true);
  });

  it('keep every credit icon small, as it is shown at 20 pixels', () => {
    const sizes = ['iuri-andreazza.png', 'nous.png', 'zeroserver.svg'].map((name) => readFileSync(publicFile(`credits/${name}`)).length);
    for (const size of sizes) expect(size).toBeLessThan(20 * 1024);
  });
});

describe('the link preview tags of index.html', () => {
  const page = readFileSync(join(root, 'index.html'), 'utf8');
  const content = (selector: RegExp): string | undefined => selector.exec(page)?.[1];

  const canonical = content(/<link rel="canonical" href="([^"]+)"/);
  const ogUrl = content(/<meta property="og:url" content="([^"]+)"/);
  const ogImage = content(/<meta property="og:image" content="([^"]+)"/);

  /** A PNG starts with an eight byte signature and the IHDR chunk, which has the width and the height right after. */
  const pngSize = (path: string): { width: number; height: number } => {
    const bytes = readFileSync(publicFile(path));
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  };

  it('spell the address of the site out, as crawlers only follow absolute URLs, and the same everywhere', () => {
    expect(canonical).toMatch(/^https:\/\/[^/]+\/$/);
    expect(ogUrl).toBe(canonical);
    expect(ogImage?.startsWith(canonical!)).toBe(true);
  });

  it('point at a picture that exists and is as big as the tags say', () => {
    const path = new URL(ogImage!).pathname;
    const { width, height } = pngSize(path);

    expect(content(/<meta property="og:image:width" content="(\d+)"/)).toBe(String(width));
    expect(content(/<meta property="og:image:height" content="(\d+)"/)).toBe(String(height));
    expect({ width, height }).toEqual({ width: 1200, height: 630 });
  });

  it('ask for the large card of X and describe the picture for those who cannot see it', () => {
    expect(content(/<meta name="twitter:card" content="([^"]+)"/)).toBe('summary_large_image');
    expect(content(/<meta property="og:image:alt" content="([^"]+)"/)).toBeTruthy();
    expect(content(/<meta name="twitter:image:alt" content="([^"]+)"/)).toBeTruthy();
  });

  it('name an apple touch icon that exists', () => {
    const icon = content(/<link rel="apple-touch-icon" href="(\/[^"]+)"/);
    expect(icon, 'index.html names no apple touch icon').toBeDefined();
    expect(existsSync(publicFile(icon!))).toBe(true);
  });
});
