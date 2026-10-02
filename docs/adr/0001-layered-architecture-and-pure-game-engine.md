---
id: 2026-10-02-0900-layered-architecture-and-pure-game-engine
title: Layered architecture with a pure game engine
type: decision
status: accepted
domain: [architecture, game]
projects: [space-invaders]
ai_context: false
ai_scope:
  - global
created: 2026-10-02
updated: 2026-10-02
---

## Context

The game has to run in the browser with React, at a fixed logical resolution of 240×320, and stay playable at any screen refresh rate. Its rules (lasers and their energy, bombs, bunkers that crumble, the saucer, capsules, waves, scoring) are where the bugs would hide, and they are easy to get wrong when mixed with rendering or React state. A global leaderboard is only worth having if a score can be checked, so the very same rules must also run on the server (see [ADR 0003](0003-replay-verified-scores.md)).

The project starts from the structure of [River Raid](https://github.com/iuriandreazza/river-raid-game), the first game of the same author on the same platform, which proved this split in production. What changes here is the game, not the shape.

## Decision

Split the web client in four layers that only depend inwards, with the browser kept at the edge:

- **`shared/game`** (the domain): the game as plain TypeScript, shared by the web client and the API. It lives outside `src/` so that the server never depends on the web app. `advance(state, input)` moves the world by one tick and returns the events that happened (an invader was destroyed, a cannon was hit, a wave was cleared). No DOM, no React, no clock, no randomness other than a seeded generator, and only arithmetic that ECMAScript defines exactly (`+ - * /`, `floor`, `ceil`, `min`, `max`, `imul`): no `Math.random`, no `pow`, no `sqrt`, no trigonometry.
- **`src/application`**: ports (`InputPort`, `RendererPort`, `SoundPort`, `FrameScheduler`, `LeaderboardPort`, `Preferences`, consent and analytics) and `GameSession`, which runs the engine at a fixed 60 ticks per second whatever the refresh rate and records the controls.
- **`src/infrastructure`**: adapters for the ports: canvas renderer, pointer and keyboard, Web Audio, `fetch`, `localStorage`, Google Analytics.
- **`src/ui`**: React screens. They draw menus, the banner and the footer; they never hold per-frame state. The game screen creates the session in an effect and disposes it in the cleanup, which keeps Strict Mode's double mounting harmless.
- **`src/compositionRoot.ts`**: the only place where ports meet adapters.

ESLint `no-restricted-imports` rules make the direction of the dependencies a build error. The API follows the same shape (`server/domain`, `server/application`, `server/infrastructure`).

The state lives in plain objects that the engine changes in place, and the renderer only reads it. Everything is placed on whole pixels except what moves by a fraction per tick (bombs that drift sideways); those are drawn on the nearest pixel.

## Consequences

- The whole rule set is covered by fast tests that need no browser: the engine is exercised tick by tick, with scenarios built by editing the state, and whole games are played by policies (a bot that aims at what matters, a random hand, a mouse-like wanderer).
- Adapters can be replaced or faked: the screens are tested with fake services, the loop with a fake scheduler.
- There is more indirection than a single-file game would need. It pays for itself in testability, and the layers are thin.
- The renderer is the one part that is verified by eye, in the browser, rather than by tests.

## Alternatives considered

- **Game logic inside React components and hooks.** Rejected: per-frame state would re-render the tree 60 times a second, and the rules could only be tested through the DOM.
- **A game framework (Phaser and similar).** Rejected: heavy for a 240×320 canvas, and it would hide the fixed-step, deterministic engine the leaderboard depends on.
- **A variable time step.** Rejected: collisions, laser damage and scoring should not depend on frame timing, and a fixed step keeps runs reproducible.

## Related

- [ADR 0002: Global leaderboard API](0002-global-leaderboard-api.md)
- [ADR 0003: Scores are verified by playing the run again](0003-replay-verified-scores.md)
- [ADR 0005: The reticle is steered with held directions](0005-reticle-steered-with-held-directions.md)
