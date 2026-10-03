import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type MiddlewareHandler } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { getPath } from 'hono/utils/url';
import { relative, resolve } from 'node:path';
import type { LeaderboardService } from '../../application/leaderboard-service.ts';
import { createApiRoutes } from './api-routes.ts';
import { resolveSecuritySettings, type SecuritySettings } from './security-settings.ts';

export interface AppOptions {
  service: LeaderboardService;
  /** Directory with the built web client. When set, its files are served and `index.html` backs every other GET. */
  staticDir?: string;
  security?: SecuritySettings;
  /** The commit this build comes from, reported by the health check. */
  revision?: string;
}

/** Vite fingerprints everything under /assets, so those files never change under the same URL. */
const FINGERPRINTED_PREFIX = '/assets/';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * The built client runs its own script and style files and talks to this server, apart from Google Analytics: its
 * script, and the places it reports to (the hosts Google lists for a tag without advertising features). No inline
 * script is allowed, which is why the client starts Analytics from its own module.
 */
const GOOGLE_TAG_MANAGER = 'https://www.googletagmanager.com';
const GOOGLE_ANALYTICS = 'https://*.google-analytics.com';

/** The only page allowed to show the game in a frame. */
const EMBEDDING_ORIGIN = 'https://escritoriio.iuriandreazza.com.br';

const CONTENT_SECURITY_POLICY = {
  defaultSrc: ["'none'"],
  scriptSrc: ["'self'", GOOGLE_TAG_MANAGER],
  styleSrc: ["'self'"],
  imgSrc: ["'self'", GOOGLE_TAG_MANAGER, GOOGLE_ANALYTICS],
  connectSrc: ["'self'", GOOGLE_TAG_MANAGER, GOOGLE_ANALYTICS, 'https://*.google.com'],
  baseUri: ["'none'"],
  formAction: ["'self'"],
  frameAncestors: [EMBEDDING_ORIGIN],
};

/** A year, as ASVS 3.4.1 asks; Hono's default is 180 days. */
const STRICT_TRANSPORT_SECURITY = 'max-age=31536000; includeSubDomains';

/**
 * Browser features the game has no use for. Gamepads, fullscreen, autoplay and the screen wake lock are left alone on
 * purpose: a game may well want them.
 */
const DENIED_BROWSER_FEATURES = {
  accelerometer: false,
  bluetooth: false,
  browsingTopics: false,
  camera: false,
  displayCapture: false,
  geolocation: false,
  gyroscope: false,
  hid: false,
  idleDetection: false,
  magnetometer: false,
  microphone: false,
  midi: false,
  payment: false,
  serial: false,
  usb: false,
  xrSpatialTracking: false,
};

/**
 * The router's wildcard does not match a line break, so a path holding an encoded one (%0A) would match no route at
 * all, not even the middleware: it would be answered by the bare default 404, without the security headers or the JSON
 * error of the API. No real path holds a control character, so each is swapped for a harmless one before routing.
 */
function routablePath(request: Request): string {
  return getPath(request).replace(/\p{Cc}/gu, '�');
}

export function createApp({ service, staticDir, security, revision }: AppOptions): Hono {
  const app = new Hono({ getPath: routablePath });
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: CONTENT_SECURITY_POLICY,
      strictTransportSecurity: STRICT_TRANSPORT_SECURITY,
      // Left out on purpose: it cannot name an origin, so it would block the one frame-ancestors allows.
      xFrameOptions: false,
      permissionsPolicy: DENIED_BROWSER_FEATURES,
    }),
  );
  app.route('/api', createApiRoutes(service, resolveSecuritySettings(security), revision));
  if (staticDir !== undefined) {
    // Mounted after the API so that it never sees /api requests, which the API answers itself.
    app.route('/', createSite(staticDir));
  }
  return app;
}

/** Whether a file of the built site was really served, as opposed to the page that stands in for a missing route. */
type SiteEnv = { Variables: { fileServed?: boolean } };

// Set after the response exists: serveStatic offers an onFound hook, but headers added there never reach the response.
const setCacheHeader: MiddlewareHandler<SiteEnv> = async (c, next) => {
  await next();
  if (!c.res.ok) return;
  // Only a file that came off the disk under /assets/ is fingerprinted. The page handed out for a made-up path under
  // /assets/ is not: caching that forever would pin the shell to a URL that may later hold a real file.
  const fingerprinted = c.get('fileServed') === true && c.req.path.startsWith(FINGERPRINTED_PREFIX);
  c.header('Cache-Control', fingerprinted ? `public, max-age=${ONE_YEAR_SECONDS}, immutable` : 'no-cache');
};

function hasFileExtension(path: string): boolean {
  return /\.[A-Za-z0-9]+$/.test(path);
}

function createSite(staticDir: string): Hono<SiteEnv> {
  // serveStatic resolves `root` against the working directory, so an arbitrary path is made relative to it.
  const root = relative(process.cwd(), resolve(staticDir)) || '.';
  const site = new Hono<SiteEnv>();
  site.get('*', setCacheHeader);
  site.get(
    '*',
    serveStatic<SiteEnv>({
      root,
      onFound: (_path, c) => {
        c.set('fileServed', true);
      },
    }),
  );
  // A missing file must stay a 404: answering a lost script with the page would only fail later and more obscurely.
  site.get('*', (c, next) => (hasFileExtension(c.req.path) ? c.notFound() : next()));
  site.get('*', serveStatic({ root, path: 'index.html' }));
  return site;
}
