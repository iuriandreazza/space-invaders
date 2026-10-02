import type { AnalyticsPort } from '../../application/ports.ts';

const GTAG_URL = 'https://www.googletagmanager.com/gtag/js';

type GtagWindow = Window & { dataLayer?: unknown[] };

/**
 * Google Analytics, started by the visitor's consent: the page's inline snippet moved here, because the CSP forbids
 * inline script. The hosts it talks to are the ones the CSP in `server/infrastructure/http/create-app.ts` allows.
 */
export class GoogleAnalytics implements AnalyticsPort {
  private readonly measurementId: string;
  private readonly page: Document;
  private installed = false;

  constructor(measurementId: string, page: Document = document) {
    this.measurementId = measurementId;
    this.page = page;
  }

  start(): void {
    this.setDisabled(false);
    if (this.installed) return;
    this.installed = true;
    try {
      this.install();
    } catch {
      // Counting visits is never worth a broken page.
    }
  }

  /** Silences a tracker that is already running, with Google's own switch, and removes the cookies it left. */
  stop(): void {
    this.setDisabled(true);
    this.forgetCookies();
  }

  private install(): void {
    const dataLayer = (this.window.dataLayer ??= []);

    // gtag.js reads `arguments` objects from the data layer and ignores arrays, so this must be a plain function that
    // pushes `arguments`, not a rest-parameter one that pushes its array.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    function gtag(..._command: unknown[]): void {
      // eslint-disable-next-line prefer-rest-params
      dataLayer.push(arguments);
    }

    gtag('js', new Date());
    gtag('config', this.measurementId);

    const script = this.page.createElement('script');
    script.async = true;
    script.src = `${GTAG_URL}?id=${encodeURIComponent(this.measurementId)}`;
    this.page.head.appendChild(script);
  }

  private get window(): GtagWindow {
    return this.page.defaultView as GtagWindow;
  }

  private setDisabled(disabled: boolean): void {
    // Google's documented opt-out: a window property named after the measurement id.
    Reflect.set(this.window, `ga-disable-${this.measurementId}`, disabled);
  }

  /** Google sets its cookies on the registrable domain, which the page cannot tell apart from its host: try them all. */
  private forgetCookies(): void {
    const labels = this.page.location.hostname.split('.');
    const domains = labels.map((_, first) => labels.slice(first).join('.'));
    for (const name of ['_ga', `_ga_${this.measurementId.replace(/^G-/, '')}`]) {
      this.page.cookie = `${name}=; Max-Age=0; Path=/`;
      for (const domain of domains) this.page.cookie = `${name}=; Max-Age=0; Path=/; Domain=${domain}`;
    }
  }
}
