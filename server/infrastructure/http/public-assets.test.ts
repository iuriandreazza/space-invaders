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
