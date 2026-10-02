# Space Invaders

A browser tribute to the arcade classic Space Invaders, in the spirit of *Space Invaders Frenzy*: two fixed cannons whose lasers converge on a reticle that you steer. Built with React and TypeScript, with a **global leaderboard**.

Aim the reticle at the fleet and burn it down before it lands. The game is the same on every run, so scores are comparable between players.

> Fan-made tribute. *Space Invaders* (Taito, 1978) and *Space Invaders Frenzy* (Raw Thrills and Taito, 2017) belong to their respective owners, who are not affiliated with and do not endorse this project. The code here is original.

## Features

- Two cannons in the bottom corners, and lasers that meet on the reticle: wherever you aim, both burn.
- Mouse, touch or keyboard.
- A fleet that sweeps and steps down, bombs, bunkers that are eaten away pixel by pixel, a flying saucer that drops capsules, and waves that get harder.
- A **global leaderboard** with arcade initials, where every score is checked by playing the run again on the server.
- No accounts and no passwords. Analytics are off unless the deployment turns them on, and then they only start through the consent banner (see [Privacy](#privacy)).

## How to play

| Input | Action |
| --- | --- |
| Mouse: move | Aim the reticle |
| Mouse: hold the left button | Fire the lasers |
| Touch | Touch the playfield to aim; the lasers fire while a finger is down |
| ← → ↑ ↓ (or W A S D) | Aim the reticle |
| Space (or Z, X) | Fire the lasers |
| P (or Esc) | Pause (the game also pauses when the window loses focus) |
| M | Mute |

### Rules

- Hold the trigger to burn whatever the reticle covers: invaders, the saucer, bombs and capsules. The lasers need energy: they run down while firing and recharge while idle, and if they overheat they stay off until they have recovered.
- Each cannon has three hit points and a bomb that lands on it takes one. The damage of the lasers is the sum of what the cannons still standing deal, so losing one halves it. Lose both cannons, or let the fleet land, and the game is over.
- The fleet sweeps from side to side and steps down at each wall, faster as it thins out. Its invaders drop bombs, which fly at your cannons or at your bunkers, and the bunkers wear away under bombs and invaders alike.
- The farther the invader, the more it is worth. Clearing a wave gives a bonus, fills the lasers up and repairs the cannons a little; the next wave comes tougher.
- A flying saucer crosses the top now and then. Destroy it for points and for a capsule, and burn the capsule to collect it: a repair heals the cannons (the saucer drops one when a cannon is hurt), otherwise a nova hurts every invader on the screen.

## Run it locally

Requires Node.js 24 and [pnpm](https://pnpm.io) (`nvm use` picks the right Node version).

```bash
pnpm install
pnpm dev
```

This starts the API on port 8787 and the web client on <http://localhost:5173>, which proxies `/api` to the API. Scores are stored in `data/leaderboard.sqlite`.

| Script | What it does |
| --- | --- |
| `pnpm dev` | API and web client with hot reload |
| `pnpm test` | Unit and component tests (Vitest) |
| `pnpm typecheck` | TypeScript, for the client, the server and the tooling |
| `pnpm lint` | ESLint, including the architecture boundaries between layers |
| `pnpm build` | Type-checks, bundles the client into `dist/` and compiles the server into `dist-server/` |
| `pnpm start` | Runs the built server, which also serves `dist/` |
| `pnpm moderate` | Lists and removes scores and plays the stored recordings again (see [Moderation](#moderation)) |
| `pnpm record-golden-runs` | Records the golden runs after the rules of the game were changed on purpose (see [How scores are protected](#how-scores-are-protected)) |

## The global leaderboard

The board is only *global* once the server runs somewhere everybody can reach. A single Node process serves both the game and the API, so any host that runs a Node 24 process (or a container) and keeps a persistent disk will do. Put it behind HTTPS.

```bash
pnpm build
PORT=8080 DATABASE_PATH=/var/lib/space-invaders/leaderboard.sqlite pnpm start
```

### Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | Port to listen on |
| `DATABASE_PATH` | `data/leaderboard.sqlite` | SQLite file; its folder is created if needed |
| `STATIC_DIR` | `dist` when it exists | Folder with the built web client; leave it out to serve the API only |
| `TRUST_PROXY` | `0` | How many reverse proxies stand in front of the server, each appending to `X-Forwarded-For`. At `0` the header is ignored; behind one platform proxy set `1`, or every player shares the proxy's rate limit |
| `LOG_CLIENT_ADDRESS` | `false` | Add the client address to the security log lines. Off by default: the log says what happened, not who did it |
| `APP_REVISION` | unset | The commit the build comes from, as a lower case hash. The image build sets it from its `REVISION` argument, and `/api/health` reports it, which is how a deploy proves what runs |
| `VITE_GA_MEASUREMENT_ID` | empty | Google Analytics measurement id (`G-XXXX`). Read when the client is **built**, not when the server runs: it has no effect on `docker run` or `pnpm start`. Give it to `pnpm build` as an environment variable, or to `docker build` as `--build-arg`. Empty leaves analytics off |

### Docker

With Docker, mount a volume on `/data`, otherwise every deploy starts with an empty board. The image runs as an unprivileged user and has a health check:

```bash
docker build -t space-invaders .       # add --build-arg VITE_GA_MEASUREMENT_ID=G-XXXX to turn analytics on
docker run -p 8080:8080 -v space-invaders-data:/data \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges space-invaders
```

These flags are the recommended hardening, and the CI builds the image and runs it with exactly them on a fresh volume. Run one instance per database: the rate limiter lives in memory and SQLite has a single writer.

### Deploying

Every push to `main` is verified by [GitHub Actions](.github/workflows/ci.yml), built as a multi-architecture image and, once switched on, deployed with the `zs` CLI to the [ZeroServer Community Cloud](https://zeroserver.cc) as a single instance, with its SQLite file on a persistent volume. [`docs/deploy.md`](docs/deploy.md) has the setup (including the repository variable `GA_MEASUREMENT_ID` for analytics), the day-to-day commands and what to expect from one instance; [ADR 0004](docs/adr/0004-single-instance-on-zeroserver.md) says why it is not several.

### Link previews

The tags that make a shared link look good (Open Graph and the X card) are in [`index.html`](index.html), and the 1200×630 picture they point to is [`public/og-image.png`](public/og-image.png). Crawlers do not run scripts and only follow absolute URLs, so the address of the site is written out in three places there: the canonical link, `og:url` and `og:image`. Change all three when the site gets another address, and ask Facebook's Sharing Debugger or LinkedIn's Post Inspector to fetch the page again, since they keep the old preview.

The credits at the foot of the title screen use the icons in [`public/credits`](public/credits). They are copies on purpose: the content security policy only lets the page load images from its own origin.

### API

| Endpoint | Description |
| --- | --- |
| `POST /api/sessions` | Registers the start of a run. Returns `201 { sessionId }` |
| `POST /api/scores` | Body `{ sessionId, initials, score, engineVersion, replay }`, as JSON, at most 1 MiB. Returns `201 { entry }` with the rank |
| `GET /api/scores?limit=10` | The best scores, highest first (`limit` from 1 to 100) |
| `GET /api/health` | `200 { status: "ok", revision? }`, where `revision` is the commit the image was built from |

Errors come as `{ error: { code, message } }`. The wire format lives in [`shared/leaderboard-contract.ts`](shared/leaderboard-contract.ts).

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | The body or a parameter is not what the API takes (an unknown route is a 404 with this code) |
| 404 | `unknown_session` | The session was never issued, expired or was removed |
| 409 | `session_already_used` | The session already holds a score |
| 409 | `outdated_client` | The page was loaded with other rules of the game: reload it |
| 409 | `duplicate_replay` | This game was already submitted |
| 413 | `payload_too_large` | The body is over the limit of the route |
| 415 | `unsupported_media_type` | The body was not sent as `application/json` |
| 422 | `invalid_replay` | The recording does not end in a game over exactly at its last tick |
| 422 | `score_mismatch` | Playing the recording gives another score than the one sent |
| 422 | `implausible_score` | The recording is longer than the session is old, or beats the points cap |
| 422 | `initials_not_allowed` | The initials are on the blocklist |
| 429 | `rate_limited` | Too many requests from this client; `Retry-After` says when to come back |
| 500 | `internal_error` | A fault of the server. Nothing about the cause is sent |

### How scores are protected

A game that runs in the player's browser can always be tampered with, so the server does not take the score on trust: it takes the **game**.

1. A run opens a **play session**; the server notes when it started.
2. The client writes down the controls held on every tick (run-length encoded, so a stretch of the same controls costs one pair of numbers) and sends them with the score.
3. The server plays the recording again with the very same engine (`shared/game`), requires the game to end in a game over exactly at the last tick, and keeps the score of *its* simulation. A different score from the client is refused.
4. The recording cannot be longer than the session is old: a game cannot be made up faster than it can be played.
5. A session holds one score, and the same game cannot be posted twice, however its recording is dressed up. Initials are three characters, `A–Z` or `0–9`, checked against a short blocklist. Requests are rate limited per client network, sizes are capped and slow requests are dropped.
6. The rules are versioned (`ENGINE_VERSION`). Changing them without raising it makes the tests fail: the recorded golden runs must still come out the same, and so must the digest of the starting layout and the difficulty tables. Pages that were open before a release are told to reload.

What it does **not** stop is a program that really plays the game, in real time, and sends the recordings of games it played well: a bot that aims and fires cannot be told apart from a good player, and no web game can tell that from the outside. Replaying the run proves that the score comes from a game that could have been played, not that a person played it. The rate limit and the [moderation](#moderation) command are the answer to that. The reasoning is in [ADR 0003](docs/adr/0003-replay-verified-scores.md), and the review against the OWASP Top 10, the OWASP API Security Top 10 and the ASVS is in [`docs/security.md`](docs/security.md).

### Moderation

With shell access to the database (`DATABASE_PATH` selects it, as for the server):

```bash
pnpm moderate list --limit 20      # the best scores, with the ids that remove takes
pnpm moderate remove 12 15         # delete scores; their sessions go with them
pnpm moderate reverify             # play every stored recording again and list the ones that fail
pnpm moderate reverify --remove    # ... and delete them
```

In the built image: `docker exec <container> node dist-server/server/cli.js list`.

## Privacy

- **The leaderboard** stores three initials, a score, the date, and the recording of the run (the controls held, which says nothing about who played it). There are no accounts, names or e-mail addresses.
- **Your address** is used to rate limit requests and is held in memory only, in the rate limit counters: it is never written to disk, and it is gone when the server restarts. It only reaches the log if whoever runs the server turns `LOG_CLIENT_ADDRESS` on.
- **Your browser** keeps the initials you typed, the mute setting and your answer to the consent banner in its local storage. They stay on your device.
- **Analytics.** A deployment can turn on Google Analytics by building the page with a measurement id (`VITE_GA_MEASUREMENT_ID`); without one the page never contacts Google. When it is on, a consent banner asks first: Google's script is loaded only after the visitor accepts, and the banner counts as accepted if the visitor leaves it alone for 5 seconds (opening its details, focusing a button in it or using the *Cookie settings* link in the footer stops the countdown). Declining keeps analytics off, and the answer can be changed at any time from the footer. Once it is loaded, Google sets its cookies (`_ga`, `_ga_*`) and receives the visitor's address and the pages seen.
- Whether this suits the LGPD, or the GDPR for visitors in Europe, is a decision for whoever runs the deployment: the GDPR does not count silence as consent, so a deployment that must meet it should leave the measurement id empty or change the banner.

## How it is built

```
shared/
  game/            the game: fleet, lasers, bombs, bunkers, saucer, scoring (pure TypeScript, no DOM, no React);
                   the API runs the same code to play a run again
  leaderboard-contract.ts   the wire format, used by both sides
src/               the web client
  application/     ports and the fixed-timestep game loop
  infrastructure/  adapters: canvas renderer, mouse, touch and keyboard input, Web Audio, HTTP client, localStorage, Google Analytics
  ui/              React screens: title, game, game over, leaderboard
  compositionRoot.ts   wires the ports to their adapters
server/            the API
  domain/          session, score and storage rules
  application/     use cases and ports
  infrastructure/  SQLite and in-memory stores, Hono routes, rate limiting, the moderation command
docs/adr/          architecture decisions
docs/              the deploy guide and the security review
```

- The game runs at a fixed 60 ticks per second on a 240×320 playfield that CSS scales up; its only random stream starts from a fixed seed, so a recorded run plays out the same way every time.
- React only draws menus. The game loop lives outside React state, and its screen creates and tears it down safely under Strict Mode.
- ESLint forbids inner layers from importing outer ones.

The reasoning is written down in [`docs/adr`](docs/adr), and the security review in [`docs/security.md`](docs/security.md).

## Credits

[Iuri Andreazza](https://iuriandreazza.com.br), [Noûs](https://nous.biz) and [ZeroServer](https://zeroserver.cc), which hosts the game.

This is an unofficial, fan-made tribute to *Space Invaders* (Taito, 1978) and to *Space Invaders Frenzy* (Raw Thrills and Taito, 2017), and is not affiliated with, endorsed by or sponsored by any of them.
