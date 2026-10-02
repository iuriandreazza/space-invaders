---
id: 2026-10-02-0910-replay-verified-scores
title: Scores are verified by playing the run again
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

[ADR 0002](0002-global-leaderboard-api.md) stops the casual attacks (a `curl` with a huge score, reusing a session, absurd points per second) and says plainly what it does not stop: nothing ties a submitted number to a game that was actually played, so anyone patient enough could post a plausible score.

The engine is deterministic: a game is a pure function of the controls held on each of the 60 ticks per second (the only randomness, where the bombs fall, comes from a generator with a fixed seed). The whole game can therefore be rebuilt from the controls, and since the engine lives in `shared/game`, the server can run the very code the player ran.

## Decision

**Submit the game, not only the score.**

- **Recording.** The web client writes down the controls on every tick (`ReplayRecorder`): a bitmask per tick (left, right, up, down, fire), run-length encoded into a flat list of `[controls, ticks]` pairs. The directions steer the reticle and `fire` is the trigger, so a mouse is recorded exactly like a keyboard, as the directions it held ([ADR 0005](0005-reticle-steered-with-held-directions.md)). A five-minute game is about 12,000 runs.
- **Playing it again.** The server plays the recording from a new game (`verifyReplay`). It accepts it only if the game ends in a game over **exactly** at the last recorded tick: a recording cut short, or one that goes on after the end, is not a finished game. The score comes from that simulation. The client also sends the score it saw, and any other number is refused (`score_mismatch`), which catches client bugs, not only cheaters.
- **Time cannot be forged.** The server knows when the play session started. The length of the recording (`ticks / 60`) has to fit in the age of the session, with 2 % and 2 seconds of tolerance. Together with one score per session, a player has to spend the time it claims.
- **The rules are versioned.** Every submission carries `ENGINE_VERSION`, and the server only replays what its own engine can reproduce (`outdated_client`). Four recorded runs (the golden runs) and a digest of the starting layout and of the difficulty tables are part of the test suite: any change that alters where a run ends fails the tests until `ENGINE_VERSION` is raised and the runs are recorded again on purpose (`pnpm record-golden-runs`). A change of rules is never silent.
- **One way to write a game down.** While it plays a recording the server also writes down the *effective* replay: the same game with every control the engine ignored cleared (left and right held together, up and down held together, a direction pushing against the edge of the screen, the trigger while the lasers are locked, anything pressed outside the game proper: intro, wave cleared, game over). Its SHA-256 is `UNIQUE` in the database, so the same game cannot be posted twice under different initials, however the recording is dressed up. A lockstep test proves that clearing exactly those controls never changes a game. A client is also required to merge neighbouring runs with the same controls (`replayProblem`), which keeps the bodies small.
- **Cheap checks first.** The order is: rate limit, content type and size of the body, shape and limits of the recording, session, initials, engine version, session age against the length of the recording, and only then the simulation, followed by the points cap on its score as a safety net. Stale or impossibly long recordings cost no CPU, and a junk recording is cheap to refuse anyway. An exception thrown by the engine while verifying is a refusal (`invalid_replay`), never a server error.
- **Kept for audit.** What is stored, compressed, with the score is the effective replay: it is bounded, free of anything a client could stuff into controls that do nothing, and plays back to the same game, so entries can be checked again later (`moderate reverify`).
- **Same code on both sides.** `shared/game` imports nothing, and the server project is compiled without the DOM library, so the engine cannot start depending on browser APIs. It also uses only arithmetic that ECMAScript defines exactly (`+ - * /`, `floor`, `ceil`, `min`, `max`, `abs`, `imul`), no `Math.random`, no clock, no `pow` or `sqrt` and no transcendental functions, so every browser and Node reach the same result for the same controls.

## Consequences

- Forging a score now means forging a **game**: controls that really produce that score, in real time. A typed number, an edited request, a replay of a session that does not exist, a score above what the recording gives, a recording cut or extended by one tick, and a recording sent twice all fail.
- A bot that plays the game, reading the screen and moving the pointer, cannot be told apart from a good player by any replay. That is true of every web game without a client the server controls. What is left is operational: rate limits, a blocklist of initials, removing entries (`moderate`), and the stored recordings to look at when something seems off. The README states this limit.
- A mouse changes the held directions much more often than a keyboard: a bot that aims at what matters changes them about 25 times a second. The limits were sized for it (100,000 runs and 1 MiB per submission, against about 30,000 runs for the longest game that is possible in practice), and a test keeps the two in step.
- Raising `ENGINE_VERSION` makes pages that are still open from before the release fail with a message asking for a reload. That is the price of not accepting scores the server cannot reproduce.
- Recordings made with an older engine cannot be played again by a newer one. Their entries stay on the board, and `moderate reverify` lists them as skipped.
- The server spends CPU on every accepted score: about 6 µs per tick, which is 0.2 seconds for a ten-minute game and about 2.5 seconds for the two-hour maximum, only reachable with a session two hours old. The age rule is what bounds the cost, and the rate limit keeps one client from stacking sessions. Verification stays in the request process; moving it to a worker thread is the next step if the numbers ever call for it.
- If a player's honest run is refused because of an engine bug, the player loses that score. The engine therefore has fuzz-style checks (random controls recorded and verified, with no exception and no mismatch), and an engine exception is logged at error level.

## Alternatives considered

- **Trusting the score with the plausibility cap alone** (ADR 0002). Cheap, and still in place as a safety net, but it leaves every plausible number open to anybody.
- **Signing the score on the client.** The key would ship in the bundle, so it only slows an attacker down.
- **Sending a checkpoint of the state now and then.** Smaller to verify, but the server would have to trust states it cannot derive, and a full recording is already small.
- **Server-side authoritative play over WebSockets.** The only way to stop bots that read the screen, and a different product: the server runs every game for the whole session and the player depends on latency. Too much for a hobby leaderboard.
- **Accounts.** Would tie scores to people, but adds sign-up, passwords and privacy duties the project does not want.

## Related

- [ADR 0001: Layered architecture with a pure game engine](0001-layered-architecture-and-pure-game-engine.md)
- [ADR 0002: Global leaderboard API](0002-global-leaderboard-api.md)
- [ADR 0005: The reticle is steered with held directions](0005-reticle-steered-with-held-directions.md)
