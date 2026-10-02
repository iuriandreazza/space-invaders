# Security policy

## Reporting a vulnerability

Please report security problems privately, using GitHub's
[private vulnerability reporting](https://github.com/iuriandreazza/space-invaders/security/advisories/new)
("Security" tab, "Report a vulnerability"). Do not open a public issue for them.

You can expect an acknowledgement within a few days. Once a fix is released the report can be published
as an advisory, crediting you if you wish.

## What matters most here

The project is a game with a public, unauthenticated leaderboard, so the interesting reports are about
the integrity and availability of that board:

- getting a score onto the board that was not earned by playing (replays, forged or tampered requests,
  bypassing the server-side verification of a run);
- injecting content into the board or the page (script, markup, offensive text that gets past the checks);
- reading or changing data outside the API's contract, including path traversal in the static file server;
- bypassing the rate limits or the one-score-per-session rule;
- leaking internal information through errors, headers or logs.

How the board is protected, and what is known to be out of reach, is written down in
[docs/security.md](docs/security.md) and [ADR 0003](docs/adr/0003-replay-verified-scores.md).

Out of scope: automation that plays the game legitimately well (a bot that really plays the game), missing
rate limits on a deployment that sits behind your own proxy, and findings in dependencies that already have
a fix in a newer release.

## Supported versions

Only the latest commit on `main` is supported.
