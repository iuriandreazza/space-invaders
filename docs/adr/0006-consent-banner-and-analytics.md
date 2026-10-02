---
id: 2026-10-02-0930-consent-banner-and-analytics
title: Consent banner (LGPD) and Google Analytics that only starts after it
type: decision
status: accepted
domain: [privacy, frontend]
projects: [space-invaders]
ai_context: false
ai_scope:
  - global
created: 2026-10-02
updated: 2026-10-02
---

## Context

The game is meant for a Brazilian audience among others, so it has to respect the LGPD (Lei 13.709/2018). It measures usage with Google Analytics (GA4), which sets cookies and sends identifiers to Google. The product owner asked for a consent banner that **accepts by itself after five seconds**, and for the site to be ready for a measurement id to be plugged in.

Everything else the game stores is small: the leaderboard keeps three initials, a score and a date (no account, no email), the browser keeps those initials, the sound setting and the consent choice in `localStorage`, and the server uses the visitor's address only in memory, to rate-limit.

## Decision

- **Analytics starts only after consent, and only if configured.** `VITE_GA_MEASUREMENT_ID` is read when the client is built; empty (the default) means no analytics at all. When it is set and the visitor has accepted, the client loads Google's script from its own module, without any inline script, which the content security policy of the server forbids (the hosts of Google are allowed there, nothing else). A visitor who declines never loads it.
- **The banner** is on every screen, never takes focus (Enter and Space start the game on the title screen), does not cover the game, and is bilingual (Portuguese for `pt*` browsers, English for the rest).
  - It offers **Accept** and **Decline**, shows a visible countdown, and **accepts after `CONSENT_AUTO_ACCEPT_SECONDS` (5)** if nobody touches it. Opening the details, focusing a button, pressing either button or using the **Cookie settings** link in the footer cancels the countdown, so that anyone who is reading is not overtaken. A banner reopened from the footer has no countdown at all, and says whether analytics are on or off.
  - It says what is collected, in a few lines that can be expanded.
  - The decision is kept in `localStorage` under a versioned key (`space-invaders:consent:v1`). A footer link opens the banner again, so that the choice can be changed (revocation is a right under the LGPD).
- **The delay is one constant.** Switching to a strict opt-in (no countdown) is a one-line change.

## Consequences

- **Open legal risk, said plainly.** The LGPD defines consent as a *free, informed and unambiguous* expression of will (art. 5, XII). Consent given by silence after a timer is easy to challenge, and a regulator or a court may not count it as consent. Under this design the only data that the choice protects is analytics; the leaderboard and the rate limit do not depend on it. If that risk is not acceptable, set the countdown to zero and let the banner wait for a click.
- The site works without any analytics: with no id, or after a decline, nothing is loaded and nothing is sent.
- Cookies of Google Analytics are set only after the visitor accepted; accepting later, from the footer, starts it for the rest of the visit.
- The banner needs its own tests with fake timers, since the interesting behavior is time.

## Alternatives considered

- **No banner, no analytics.** The simplest, but the owner wants numbers.
- **Strict opt-in (nothing happens until a click).** The safest in law and the most honest, at the cost of fewer measured visits. Kept as the one-line fallback.
- **A privacy-friendly counter without cookies.** Would need a different tool and an extra origin; GA was asked for.
- **A consent management platform.** Heavy, third-party scripts and styles, and the content security policy would have to open up for them.

## Related

- [ADR 0001: Layered architecture with a pure game engine](0001-layered-architecture-and-pure-game-engine.md)
- [Security review](../security.md)
