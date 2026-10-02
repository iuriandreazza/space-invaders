---
id: 2026-10-02-0948-global-leaderboard-api
title: Global leaderboard API
type: decision
status: accepted
domain: [architecture, backend, security]
projects: [space-invaders]
ai_context: false
ai_scope:
  - global
created: 2026-10-02
updated: 2026-10-02
---

## Context

A leaderboard is only *global* if every player reads and writes the same data, so the game needs a server. The game runs in the player's browser, so a submitted score cannot be trusted: anybody can call the API by hand. The project should start simple. This design was first worked out for River Raid, the author's earlier game, and Space Invaders starts from the same server.

## Decision

A small Node API (Hono) with a SQLite file as storage, served by the same process that hosts the built web client:

- **One process, one origin.** `pnpm start` serves `dist/` and `/api`. No CORS, no second deployment. In development, Vite proxies `/api`.
- **Storage behind a port.** `LeaderboardStore` has a SQLite adapter (`node:sqlite`, no native dependency) and an in-memory one used by tests. Both run the same contract test suite. Moving to another database means writing one adapter.
- **Play sessions instead of signed tokens.** A run first calls `POST /api/sessions`; the server stores when it started. A score is accepted once per session (a `UNIQUE` constraint on the score table, so racing requests cannot both win) and only if it does not exceed `1000 points per second × elapsed time + 1000`. That cap is a safety net: [ADR 0003](0003-replay-verified-scores.md) holds the real check, which plays the recorded game again. Sessions are in the database, so there is no secret to manage, and unused sessions older than a day are pruned when a new one opens.
- **Arcade initials.** The name is exactly three characters, `A–Z` or `0–9`. It is easy to validate and avoids free-text abuse.
- **The limit is tied to the game.** `MAX_SCORE_PER_SECOND` lives in `shared/`, next to the rules it is derived from, and is set above what the engine's scoring can award per second of play. Being generous costs nothing, since the replay is the real check; being too low would refuse honest runs.
- **A deterministic game** makes scores comparable: the engine has a single seeded random stream and the controls are its only input, so nobody gets an easier run and any run can be played again.

## Consequences

- The board becomes global when the server is deployed on a host that gives the process a persistent disk (a Docker volume on `/data` in the provided image). [ADR 0004](0004-single-instance-on-zeroserver.md) records where it runs.
- SQLite on a local file means one server instance. Scaling out needs a networked database and a new adapter; the port is already there.
- The plausibility cap alone stops only casual cheating (a `curl` with a huge score, reuse of a session, absurd rates), and lets anyone patient submit plausible numbers. That gap is closed by [ADR 0003](0003-replay-verified-scores.md), which replays the game on the server. The API also limits each client, caps its tables, drops slow requests and refuses oversized or mistyped bodies (see [the security review](../security.md)).
- A refused submission never costs the player the session: the session is spent only by an insert that passed every check.

## Alternatives considered

- **A hosted backend (Firebase, Supabase, Cloudflare D1).** Viable, and the port keeps the option open. Rejected as the default because it ties the project to one vendor, and the platform that hosts the game already offers a volume.
- **`localStorage`.** Not global.
- **HMAC-signed session tokens.** Stateless, but they need a secret and give no way to enforce one score per session without storing something anyway.
- **Free-text names.** More expressive, but they need moderation.

## Related

- [ADR 0001: Layered architecture with a pure game engine](0001-layered-architecture-and-pure-game-engine.md)
- [ADR 0003: Scores are verified by playing the run again](0003-replay-verified-scores.md)
- [Security review of the leaderboard](../security.md)
