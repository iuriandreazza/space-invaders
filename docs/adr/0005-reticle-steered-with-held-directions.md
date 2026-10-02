---
id: 2026-10-02-0920-reticle-steered-with-held-directions
title: The reticle is steered with held directions, and a pointer is turned into them
type: decision
status: accepted
domain: [architecture, game, input]
projects: [space-invaders]
ai_context: false
ai_scope:
  - global
created: 2026-10-02
updated: 2026-10-02
---

## Context

The game is a tribute to the arcade cabinet Space Invaders Frenzy: two cannons fixed in the bottom corners, whose lasers converge on a reticle that the player aims with a pointing device. Here the reticle is aimed with the mouse (or a finger) or with the keyboard.

The controls of a game are what a recording has to hold for the server to play it again ([ADR 0003](0003-replay-verified-scores.md)). Two things pull in opposite directions: a pointer is a position that changes all the time, and a recording has to stay small, exact and hard to forge.

## Decision

**The engine takes the same five controls as a keyboard does: left, right, up, down and fire.** The directions move the reticle by a fixed step per tick (4 pixels, clamped to the playfield); fire pulls the trigger.

A pointer is turned into those controls by an adapter on the client, every tick: the position of the pointer, converted to the logical resolution of the canvas, is a target, and the adapter holds the directions that bring the reticle towards it (`steerToward`). The reticle follows the pointer at the speed of the keyboard, not instantly.

- **Dead zone.** Because the reticle moves in whole steps, it could swing back and forth over a target it cannot hit exactly. The adapter holds nothing once the reticle is within 2 pixels of the target (`AIM_SPEED <= 2 * deadZone` is the condition for it to settle on the fractional targets that a mouse produces, and a test simulates the engine's movement from many starts to many targets to prove it). The price is an aim that can be 2 logical pixels off, about 6 on a typical screen.
- **Last device wins.** A steering key switches to the keyboard, moving the pointer switches back. Firing is the or of the primary button (or a finger down) and the fire keys.
- **Touch.** A finger is a pointer: touching aims, and holding fires.

## Consequences

- The recording is the one already built for River Raid: a bitmask per tick, run-length encoded, and the server needs nothing new to verify a game played with a mouse.
- The mouse has no speed advantage over the keyboard: both move the reticle at the same pace. What the pointer gives is a more direct way to say where to go. That keeps the board fair between devices.
- Nothing about the pointer reaches the server: not its position, nor how it moved. Only the directions that were held count, which are what the engine acted on.
- The reticle lags behind the pointer by the time it needs to travel (a full width takes about one second), so the operating system cursor is hidden over the canvas, and the reticle is the only thing to look at.
- A mouse changes the held directions more often than a keyboard, so a recording has more runs; the limits of the API were raised for it (see ADR 0003).

## Alternatives considered

- **Recording the pointer's position on every tick.** Closer to what the player does, but two numbers per tick instead of one bitmask, much larger recordings, and the engine would have to trust a position that could jump anywhere in one tick (a bot could flick the reticle to every target at once, which no keyboard player could).
- **Quantizing the position into a coarse grid and recording changes only.** Smaller than raw positions, but it still lets the reticle teleport, and it needs a second rule to say how far a tick may move it.
- **Moving the reticle with an acceleration ramp.** More natural for a keyboard, and the adapter could still steer a pointer, but a ramp needs the adapter to predict where the reticle will stop; the fixed step is simple and provably settles.

## Related

- [ADR 0001: Layered architecture with a pure game engine](0001-layered-architecture-and-pure-game-engine.md)
- [ADR 0003: Scores are verified by playing the run again](0003-replay-verified-scores.md)
