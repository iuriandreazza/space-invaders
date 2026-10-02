// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { GoogleAnalytics } from './googleAnalytics.ts';

type GtagWindow = Window & { dataLayer?: IArguments[] };

const gtagWindow = window as GtagWindow;
const optOut = (measurementId: string): unknown => Reflect.get(window, `ga-disable-${measurementId}`);

afterEach(() => {
  delete gtagWindow.dataLayer;
  Reflect.deleteProperty(window, 'ga-disable-G-TEST123');
  document.head.querySelectorAll('script').forEach((script) => script.remove());
  document.cookie.split('; ').forEach((cookie) => {
    document.cookie = `${cookie.split('=')[0]}=; Max-Age=0; Path=/`;
  });
});

describe('GoogleAnalytics', () => {
  it('loads nothing until it is started', () => {
    new GoogleAnalytics('G-TEST123');

    expect(document.head.querySelector('script')).toBeNull();
    expect(gtagWindow.dataLayer).toBeUndefined();
  });

  it('loads gtag.js for the measurement id without blocking the page', () => {
    new GoogleAnalytics('G-TEST123').start();

    const script = document.head.querySelector('script');
    expect(script?.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST123');
    expect(script?.async).toBe(true);
  });

  it('queues the start and the configuration for gtag.js', () => {
    new GoogleAnalytics('G-TEST123').start();

    // gtag.js only understands `arguments` objects in the data layer, not arrays.
    const queue = gtagWindow.dataLayer ?? [];
    expect(queue.map((entry) => Object.prototype.toString.call(entry))).toEqual(['[object Arguments]', '[object Arguments]']);
    expect(Array.from(queue[0]!)[0]).toBe('js');
    expect(Array.from(queue[0]!)[1]).toBeInstanceOf(Date);
    expect(Array.from(queue[1]!)).toEqual(['config', 'G-TEST123']);
  });

  it('keeps what was already in the data layer', () => {
    const existing = ['something else'];
    (gtagWindow as unknown as { dataLayer: unknown[] }).dataLayer = existing;

    new GoogleAnalytics('G-TEST123').start();

    expect(gtagWindow.dataLayer).toBe(existing);
    expect(existing).toHaveLength(3);
  });

  it('escapes the measurement id in the address of the script', () => {
    new GoogleAnalytics('G-A&B=1').start();

    expect(document.head.querySelector('script')?.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-A%26B%3D1');
  });

  it('never breaks the page it runs in', () => {
    (gtagWindow as unknown as { dataLayer: unknown }).dataLayer = 'not a queue';

    expect(() => new GoogleAnalytics('G-TEST123').start()).not.toThrow();
  });

  it('installs once however many times it is started', () => {
    const analytics = new GoogleAnalytics('G-TEST123');
    analytics.start();
    analytics.start();

    expect(document.head.querySelectorAll('script')).toHaveLength(1);
    expect(gtagWindow.dataLayer).toHaveLength(2);
  });

  describe('stop', () => {
    it("turns on Google's switch that silences the tag for this measurement id", () => {
      const analytics = new GoogleAnalytics('G-TEST123');
      analytics.start();
      expect(optOut('G-TEST123')).toBe(false);

      analytics.stop();

      expect(optOut('G-TEST123')).toBe(true);
    });

    it('works before anything was started', () => {
      new GoogleAnalytics('G-TEST123').stop();

      expect(optOut('G-TEST123')).toBe(true);
      expect(document.head.querySelector('script')).toBeNull();
    });

    it('removes the cookies of Analytics and no others', () => {
      document.cookie = '_ga=GA1.1.1.1; Path=/';
      document.cookie = '_ga_TEST123=GS2.1.s1; Path=/';
      document.cookie = '_ga_OTHER=GS2.1.s1; Path=/';
      document.cookie = 'unrelated=yes; Path=/';

      new GoogleAnalytics('G-TEST123').stop();

      expect(document.cookie.split('; ').sort()).toEqual(['_ga_OTHER=GS2.1.s1', 'unrelated=yes']);
    });

    it('lets a later start turn the tag back on without loading it again', () => {
      const analytics = new GoogleAnalytics('G-TEST123');
      analytics.start();
      analytics.stop();
      analytics.start();

      expect(optOut('G-TEST123')).toBe(false);
      expect(document.head.querySelectorAll('script')).toHaveLength(1);
    });
  });
});
