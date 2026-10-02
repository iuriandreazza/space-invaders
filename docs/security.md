---
id: 2026-10-02-0949-security-review-of-the-leaderboard
title: Security review of the leaderboard
type: review
status: draft
domain: [security, backend, architecture]
projects: [space-invaders]
ai_context: false
ai_scope:
  - global
created: 2026-10-02
updated: 2026-10-02
---

How the global leaderboard is protected from being forged, flooded or defaced, checked against the OWASP Top 10:2025, the OWASP API Security Top 10:2023 and the OWASP ASVS 5.0. The design reasoning for the central control is in [ADR 0003](adr/0003-replay-verified-scores.md); how to report a problem is in [SECURITY.md](../SECURITY.md).

This game started from River Raid, the author's earlier game, whose server, static file host, container and pipeline were carried over unchanged, tests included. The review below was done on that code there. The controls and the tests that guard them are this repository's; the evidence that was gathered by hand on River Raid is marked as such, and has not been repeated for Space Invaders yet (see *Not done*).

## Scope and method

- **Scope:** the leaderboard API, the static file server that hosts the game, the web client as far as it touches the leaderboard, the container image and the supply chain. Out of scope: the TLS and network layer of whatever hosts the server.
- **Method:**
  1. a threat model of the board (below), written before the fixes of the River Raid review;
  2. on River Raid: a code review of the whole branch with the security-review checklist, then a second, independent review in a scratch copy of the repository (read-only, with its own probes and mutation tests);
  3. in this repository: one automated test per control, listed in the tables, so that a regression fails the build;
  4. on River Raid: manual checks of the running, built server: the security headers on every kind of response (errors and 404s included), the cache headers, content types, the absence of version headers, a real game played in a browser and saved to the board, and the stored recording played again with `pnpm moderate reverify`;
  5. `pnpm audit`: no known vulnerabilities in this repository's lockfile on 2026-10-02, and none on River Raid at the time of its review. The pipeline runs `pnpm audit --audit-level high` on every push.
- **New in Space Invaders and not reviewed independently yet:** the engine in `shared/game` (the fleet, the bombs, the bunkers, the lasers and the way the controls are written down), the web client with its mouse, touch and keyboard input, and the consent banner for analytics.
- **Not done:**
  - a penetration test by a third party;
  - the manual checks of step 4, and a second independent review, on this game: they are to be repeated once it is built and running;
  - the arm64 image: the CI builds the container image and runs it with the hardening flags below on a fresh volume (health check, page, a write to the database, the moderation command, a non-root process), but for amd64 only. The arm64 build runs for the first time on `main`.

## What is protected, and from whom

| Asset | Who may threaten it |
| --- | --- |
| Every entry on the board was earned by playing | someone with `curl` or the browser console; someone who edits a real recording; a bot author |
| The board and the page stay up and useful | a flooder; a client that sends huge or slow requests |
| The page shows nothing but initials and scores | a griefer who wants script, markup or offensive text on it |
| The host and the database file | anyone who can send a request |
| The supply chain | a malicious or compromised dependency |

No account, password or personal data exists on the server: the only stored data is three characters, a score, a timestamp and the recording of the run. Client addresses are not stored; they are logged only when `LOG_CLIENT_ADDRESS=true`. The one exception is outside the server: when a Google Analytics measurement id was built into the page and the visitor accepts the consent banner, the page loads Google Analytics, which sets its own cookies (`_ga`, `_ga_*`) and reports page views to Google (see the residual risks).

## Abuse cases and controls

| Abuse | Control | Where | Test |
| --- | --- | --- | --- |
| Post a made-up score | The server plays the recorded controls with the same engine, the game has to end in a game over exactly at the last tick, and the score kept is the simulated one. The score the client sends must equal it. | `shared/game/replay.ts`, `server/application/leaderboard-service.ts` | `replay.test.ts`, `submission-verification.test.ts` |
| Pass off a game that was not played in real time | The recording cannot be longer than the session is old (`ticks / 60 ≤ age × 1.02 + 2 s`). The session start is the server's clock. | `server/domain/play-session.ts` | `play-session.test.ts`, `leaderboard-service.test.ts` |
| Edit, cut or extend a real recording | Any change either breaks the exact end of the game or changes the score. | `verifyReplay` | `replay.test.ts` |
| Post the same game twice, or reuse a session | One score per session (`UNIQUE`), and the fingerprint of the effective replay (the game with the controls the engine ignores cleared) is `UNIQUE` too, so a game dressed up with ignored controls is still the same game. | `effectiveInput`, `sqlite-leaderboard-store.ts` | `replay.test.ts` (lockstep), `leaderboard-store.contract.test.ts`, `submission-verification.test.ts` |
| Keep playing after the rules changed | `ENGINE_VERSION` is sent with every score and must match (`outdated_client`). The golden runs (recordings of the engine kept in the tests) and a digest of the starting layout and the difficulty tables fail the build if the rules change without a version bump. | `replay.ts`, `testing/golden-runs.ts` | `replay.test.ts` |
| Flood the board, the sessions or the disk | Rate limits per client network, per route; tables capped (10,000 scores, 50,000 sessions, the oldest unused sessions go first); body limits per route (1 MiB for a score, which holds the longest recording the engine accepts, 1 KiB elsewhere); slow requests dropped. | `rate-limit.ts`, `storage-limits.ts`, `request-guards.ts`, `server-limits.ts` | `rate-limit.test.ts`, `api-hardening.test.ts`, `sqlite-leaderboard-store.test.ts` |
| Cross-site writes | Writes need `Content-Type: application/json`, which a cross-site form cannot send and which needs a CORS preflight that is never granted. | `require-json-body.ts` | `require-json-body.test.ts` |
| Offensive initials | Exactly three characters, `A–Z` or `0–9`, checked by the server; a short blocklist that reads digits as the letters they resemble; the moderation command for the rest. | `shared/initials.ts`, `shared/blocked-initials.ts`, `moderation-cli.ts` | `initials.test.ts`, `blocked-initials.test.ts`, `moderation-cli.test.ts` |
| Script or markup on the page | React renders everything as text and there is no `dangerouslySetInnerHTML`; the stored fields are three characters from a closed alphabet; the CSP allows no inline script and no script but the game's own and Google's `gtag.js`. | `src/ui/*`, `create-app.ts` | `App.test.tsx`, `create-app.test.ts` |
| SQL injection | Prepared statements only; no SQL is built from input. | `sqlite-leaderboard-store.ts` | `sqlite-leaderboard-store.test.ts` |
| Read files outside the site | `serveStatic` is rooted in `dist/`; a path with a control character is rewritten before routing, so it cannot slip past the middleware. | `create-app.ts` | `create-app.test.ts` |
| Poison a cache or a proxy | API answers are `no-store`; the page is `no-cache`; `immutable` only for a fingerprinted file that was really served from `/assets/`. | `create-app.ts`, `api-routes.ts` | `create-app.test.ts` |
| Borrow someone else's rate limit, or forge the log | `X-Forwarded-For` is ignored unless `TRUST_PROXY` says how many proxies stand in front; then only the entry the first of them added counts. IPv6 clients are counted by their /64, IPv4 clients of a dual-stack socket as IPv4. | `client-address.ts` | `client-address.test.ts`, `rate-limit.test.ts` |
| Learn about the server from an error | Generic JSON errors; the cause goes to the log only; no `Server` or `X-Powered-By` header. | `error-responses.ts` | `create-app.test.ts` |
| Guess a session id | 128 random bits from the operating system's generator. | `session-id.ts` | `session-id.test.ts` |
| A malicious dependency | Releases younger than a day are refused (`minimumReleaseAge`, strict), the lockfile is installed frozen, Dependabot proposes updates (npm, Docker and Actions) after a three-day cooldown, pnpm does not run the install scripts of dependencies unless they are allowed and none is. Secret scanning and push protection were on for River Raid and are to be switched on for this repository. In the pipeline, Actions are pinned by commit, the `zs` binary by version and SHA-256, the token only reads (the image job also writes packages) and pull requests never see a secret. | `pnpm-workspace.yaml`, `.github/dependabot.yml`, `.github/workflows/ci.yml`, `Dockerfile` | `pnpm audit` |

## OWASP Top 10:2025

| Category | Status | How |
| --- | --- | --- |
| A01 Broken Access Control | Met | There is no privileged function over HTTP. The only capability is a session id, unguessable and good for one score. Responses carry no internal ids. Moderation needs shell access to the database. |
| A02 Security Misconfiguration | Met | CSP, HSTS (one year), `nosniff`, `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy`, COOP/CORP on every response; the CSP opens only the hosts Google Analytics needs and never `'unsafe-inline'`; no debug mode, directory listing or version header; container runs as `node` with a health check. |
| A03 Software Supply Chain Failures | Met | See the last row of the table above. `pnpm audit` found nothing on 2026-10-02, and the pipeline fails on high or critical advisories. |
| A04 Cryptographic Failures | Met | Nothing secret is stored or sent. TLS is the host's job and the app sends HSTS. Session ids and SHA-256 use the platform's primitives. |
| A05 Injection | Met | Prepared statements, a closed alphabet for stored text, no `eval`, no shell, structured JSON logs. |
| A06 Insecure Design | Met | The abuse cases above drove the design: the server does not trust the score, it replays the game; the cost of that is bounded by the session age rule; rules are versioned. |
| A07 Authentication Failures | N/A by design | Play is anonymous. Sessions are capabilities, not logins. |
| A08 Software or Data Integrity Failures | Met | The replay verification is exactly this control for data coming from an untrusted client. Dependencies are pinned by the lockfile and held back a day. |
| A09 Security Logging and Alerting Failures | Partially met | Refusals, rate limits, oversized and mistyped requests and engine errors are logged as JSON lines. Nothing watches the log: alerting is up to the host. |
| A10 Mishandling of Exceptional Conditions | Met | Every refusal has a code; unexpected errors become a generic 500; an engine exception while verifying is a refusal and a loud log line. How the client copes with a missing canvas, missing audio, an unreadable answer or a silent server is not part of this review yet. |

## OWASP API Security Top 10:2023

| Category | Status | How |
| --- | --- | --- |
| API1 Broken Object Level Authorization | Met | Objects are sessions, reachable only by their 128-bit id. |
| API2 Broken Authentication | N/A by design | No authentication. |
| API3 Broken Object Property Level Authorization | Met | Entries expose `rank`, `initials`, `score`, `achievedAt`; bodies are read field by field, never merged into objects. |
| API4 Unrestricted Resource Consumption | Met | Rate limits, body limits, timeouts, table caps, and a verification cost bounded by the session age. |
| API5 Broken Function Level Authorization | Met | No administrative function over HTTP. |
| API6 Unrestricted Access to Sensitive Business Flows | Met, with a stated limit | The sensitive flow is posting a score. It needs a session, real time, a verified game, a new game, allowed initials and a client within its rate limit. A bot that plays for real is not stopped (see below). |
| API7 Server Side Request Forgery | N/A | The server makes no outgoing request. |
| API8 Security Misconfiguration | Met | See A02. No CORS headers are sent. |
| API9 Improper Inventory Management | Met | One version of one small API, documented in the README; the engine has its own version. |
| API10 Unsafe Consumption of APIs | N/A | The server consumes nothing third-party. The client talks to its own origin and, for Google Analytics, to the hosts listed in `connect-src`; no answer from them is read. |

## OWASP ASVS 5.0

Levels 1 and 2 where they apply to a public, anonymous service, plus a few level 3 items that came for free. Level 3 items that were not done are listed at the end.

| ID | Level | Requirement (short) | Status | Evidence |
| --- | --- | --- | --- | --- |
| 1.2.1, 1.2.3 | L1 | Context-aware output encoding | Met | React text rendering; JSON built with `c.json`. |
| 1.2.4 | L1 | Parameterized queries | Met | `sqlite-leaderboard-store.ts`. |
| 1.3.2 | L1 | No `eval` or dynamic code | Met | None in the code; the CSP forbids it. |
| 1.4.2 | L2 | Range checks against integer overflow | Met | `replayProblem`, `parseScoreSubmission`. |
| 1.5.2 | L2 | Safe deserialization | Met | `JSON.parse` of a validated shape only. |
| 2.1.1, 2.1.3 | L1/L2 | Validation rules and business limits are documented | Met | This page, ADR 0003. |
| 2.2.1, 2.2.2, 2.2.3 | L1/L2 | Allow-list validation on the server, consistent combinations | Met | `parseScoreSubmission`, the score against the replay, the version, the age. |
| 2.3.1 | L1 | Business flow in order | Met | Session before score. |
| 2.3.2 | L2 | Business limits | Met | Age rule, caps, rate limits. |
| 2.3.3, 2.3.4 | L2 | Transactions and locking | Met | `BEGIN IMMEDIATE`; `UNIQUE` session and fingerprint. |
| 2.4.1 | L2 | Rate limiting | Met | `rate-limit.ts`. |
| 2.4.2 | L3 | Realistic human timing | Met | A game cannot be submitted faster than it takes to play. |
| 3.2.1, 3.2.2 | L1 | Safe rendering context | Met | CSP, `nosniff`, React. |
| 3.4.1 | L1 | HSTS of at least one year | Met | `create-app.ts` (the host must serve HTTPS). |
| 3.4.2 | L1 | CORS | Met | No CORS headers; same origin. |
| 3.4.3, 3.4.4, 3.4.5, 3.4.6 | L2 | CSP, `nosniff`, Referrer-Policy, framing | Met | `create-app.ts` and its tests; verified by hand on the live servers of River Raid and of this game (2026-10-02) for the page, an asset, the favicon, JSON, a 400 and a 415. The gateway replaces a 404 of the app with its own page, which has none of these headers (see [deploy.md](deploy.md)). |
| 3.4.8 | L3 | COOP | Met | `same-origin`. |
| 3.5.1, 3.5.2, 3.5.3 | L1 | CSRF, preflight, safe methods | Met | `require-json-body.ts`; writes are POST with JSON. |
| 4.1.1 | L1 | Content type with charset | Met | Pages are `text/html; charset=utf-8`; JSON has no charset parameter. |
| 4.1.3 | L2 | Intermediary headers cannot be forged | Met | `TRUST_PROXY`. |
| 4.1.4 | L3 | Only supported methods | Met | Other methods get a JSON 404; `TRACE` too. |
| 11.4.1 | L1 | Approved hash functions | Met | SHA-256. |
| 11.5.1 | L2 | CSPRNG, 128 bits | Met | `session-id.ts`. |
| 13.4.1 | L1 | No version control metadata served | Met | Only `dist/` is served; the image has no `.git`. |
| 13.4.2, 13.4.3, 13.4.4, 13.4.5 | L2 | No debug mode, listings, `TRACE`, stray endpoints | Met | One public non-API endpoint: `/api/health`. |
| 13.4.6, 13.4.7 | L3 | No version header, only safe file types | Met | Checked by hand on the live servers of River Raid and of this game (2026-10-02): the only `server` header is the gateway's (`Caddy`), the app sends none. The health check reports the commit of the app (a public repository) and no component versions. |
| 14.2.1 | L1 | No sensitive data in URLs | Met | Only `limit`. |
| 14.3.3 | L2 | Browser storage | Met | `localStorage` keeps the initials, the mute setting and the answer to the consent banner. |
| 15.1.1, 15.2.1 | L1 | Remediation timeframes for components | Met | Dependabot weekly, `SECURITY.md`. |
| 15.1.3, 15.2.2 | L2 | Resource-intensive functionality is documented and defended | Met | ADR 0003, the age rule, the rate limit. |
| 15.2.3 | L2 | No test code in production | Met | The build excludes tests and `testing/`; the image installs production dependencies only. |
| 15.3.1, 15.3.3 | L1/L2 | Return only needed fields, no mass assignment | Met | Explicit field lists. |
| 15.3.4 | L2 | The real client address | Met | `client-address.ts`. |
| 15.3.5, 15.3.6, 15.3.7 | L2 | Strict types, no prototype pollution, no parameter pollution | Met | `Number.isInteger` and `typeof` checks; `Map` for the limiter; one `limit` read. |
| 15.4.2 | L3 | No time-of-check/time-of-use gap | Met | The constraints decide, not a prior lookup. |
| 16.2.5, 16.4.1 | L2 | No sensitive data in logs; no log injection | Met | `security-log.ts`: bodies, initials and session ids are never logged; one JSON line per event. |
| 16.3.3, 16.3.4 | L2 | Security events and unexpected errors are logged | Met | `security-events.ts`, `error-responses.ts`. |
| 16.5.1 | L2 | Generic errors | Met | `handleUnexpectedError`. |
| 16.2.1 | L2 | Who, what, where and when in every entry | Partially met | The caller is left out on purpose unless `LOG_CLIENT_ADDRESS=true`. |
| 13.1.2 | L3 | Connection limits | Not done | Node defaults plus the rate limit. |
| 3.4.7 | L3 | CSP violation reporting | Not done | |
| 15.1.2 | L2 | A software bill of materials | Partially met | `pnpm-lock.yaml` is the inventory; no SBOM is generated. |

## What the review of the River Raid server found

These are the findings of the review of the River Raid server, which this game's server is a copy of; each was fixed there and the fixes are part of the code carried over. The findings about River Raid's own engine and client are left out, as they do not apply to this game, whose engine and client have not been through the same review.

| Finding | Severity | Resolution |
| --- | --- | --- |
| The leaderboard took any plausible number on trust. | High | Scores are verified by replaying the run ([ADR 0003](adr/0003-replay-verified-scores.md)). |
| The same game could be posted twice with different hashes by changing controls the engine ignores (confirmed end to end by a second reviewer). | Medium | The fingerprint is taken over the effective replay; a lockstep test proves that clearing exactly those controls never changes a game. |
| No rate limiting, no timeouts, no table caps, no content-type check. | Medium | Added, per route; see the controls above. |
| `index.html` was served with `immutable` for made-up paths under `/assets/`. | Low | `immutable` only for a file that was really served. |
| A path with an encoded line break skipped the middleware and was answered without the security headers. | Low | Control characters are rewritten before routing. |
| Rate limits could be dodged by changing IPv6 address inside one /64. | Medium | IPv6 clients are counted by their /64. |
| Session ids were UUID v4 (122 random bits). | Low | 128 random bits. |

## Residual risks and non-goals

- **A bot that really plays the game** reads the screen and steers the reticle and the trigger like a player, so its recording is as good as a player's. Nothing short of a client the server controls can tell them apart. What bounds it: a rate limit of 30 sessions and 20 scores per minute per client network, a session that has to live as long as the game, a game that must not have been posted before, the blocklist and the moderation command. One client can still post up to 20 distinct verified games a minute, so a board that matters should tighten the limits (`DEFAULT_RATE_LIMITS`) and watch the log.
- **One instance.** The rate limiter lives in memory and SQLite has a single writer. Several instances need a shared limiter and another store adapter (the port exists).
- **CPU.** Playing a recording costs CPU in proportion to the length of the game, and a game can only be as long as its session is old, so the worst case needs a session held for two hours. The figures measured for River Raid (about 8 ms per two minutes of play and about half a second for the two-hour maximum) say nothing about this engine, and are to be measured again with it. Verification stays in the request process; a worker thread is the next step if numbers ever call for it.
- **Large recordings.** A mouse changes the controls far more often than a keyboard, so a recording may hold up to 100,000 runs, about 700 KB of JSON, and the route that takes a score accepts bodies up to 1 MiB. A client has 15 seconds to deliver a whole request, so only a body of that size needs a connection of about 70 KB/s.
- **HTTPS is the host's job.** Without it HSTS means nothing, and `Secure` transport is not guaranteed.
- **Alerting.** The log has what is needed; nothing reads it.
- **The blocklist is short** and aimed at English and Portuguese. Anything craftier is for the moderation command.
- **The game loop is outside React,** so an exception in it is not caught by the error boundary. The engine is fuzzed (random controls recorded and verified) to make that unlikely.
- **The engine is assumed deterministic across browsers.** It is meant to use only arithmetic that ECMAScript defines exactly; the golden runs run in Node, so a divergence in a browser would show up as refused honest runs, never as accepted forged ones.
- **Google Analytics is a third party on the page.** It is off unless a measurement id was given at build time (`VITE_GA_MEASUREMENT_ID`, see [deploy.md](deploy.md)), and even then the client only loads `gtag.js` after the visitor accepts the consent banner, which counts as accepted if the visitor leaves it alone for 5 seconds (opening its details, focusing a button in it or using the footer link stops the countdown, and the answer can be changed from the footer). Once loaded, `gtag.js` runs with the page's privileges, so Google (or whoever compromises that script) could read the page and the recording of a run before it is sent. The CSP limits where it can send data, not what it can do. It also sets cookies and sends the visitor's address and page views to Google. Whether a banner that takes silence for acceptance satisfies the LGPD or the GDPR is not settled here, and this page does not claim that it does: the GDPR does not count inactivity as consent, and the LGPD asks for an unequivocal statement of will. It is for the owner of the deployment to decide, and the way out is to leave the measurement id empty.
- **No third-party penetration test.**

## Operating the leaderboard

**Deploy**

- The pipeline and the platform that hosts the game are described in [deploy.md](deploy.md). On the ZeroServer Community Cloud the gateway terminates HTTPS and the app runs as one instance.
- Put the server behind HTTPS. Set `TRUST_PROXY` to the number of reverse proxies that append to `X-Forwarded-For` (`1` for a single platform proxy), otherwise every client shares the proxy's allowance. Leave it at `0` when clients reach the server directly. On the ZeroServer Community Cloud it was measured as `2` for River Raid and again for this game (deploy.md, step 6).
- Keep the database on a persistent volume. Only one instance may use it.
- Suggested container flags: `--read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges -v space-invaders-data:/data` (the CI runs the image with them).

**Logs.** One JSON line per event on standard error: `rate_limited`, `unsupported_media_type`, `payload_too_large`, `submission_refused` (with `code`, `reason`, a 12-character reference of the session and the length of the run). A run of `invalid_replay` or `score_mismatch` from one place is someone trying; an `engine_error` is an honest run that hit a bug and deserves an issue.

**Moderation** (needs shell access to the database file):

```bash
pnpm moderate list --limit 20            # best scores with the ids that remove takes
pnpm moderate remove 12 15               # delete scores; their sessions go with them
pnpm moderate reverify                   # play every stored recording again, list the ones that fail
pnpm moderate reverify --remove          # ... and delete them
node dist-server/server/cli.js list      # the same, in the built image: docker exec <container> node dist-server/server/cli.js list
```

**Changing the rules of the game.** Any change to the engine that alters where a recording ends up must raise `ENGINE_VERSION` in `shared/game/replay.ts` and regenerate the golden runs with `pnpm record-golden-runs`. The tests fail until both are done. Pages that were open before the release get `outdated_client` and a message asking to reload; stored recordings of the old version are listed by `reverify` as skipped.

## Re-running the checks

```bash
pnpm test         # unit, component and end-to-end tests of every control above
pnpm lint         # includes the layer boundaries, screens cannot import adapters
pnpm typecheck
pnpm build
pnpm audit
```
