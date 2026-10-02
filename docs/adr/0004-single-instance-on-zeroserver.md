---
id: 2026-10-02-0947-single-instance-on-zeroserver
title: One instance on the ZeroServer Community Cloud, SQLite on a volume
type: decision
status: accepted
domain: [architecture, deployment]
projects: [space-invaders]
ai_context: false
ai_scope:
  - global
created: 2026-10-02
updated: 2026-10-02
---

## Context

The game is published on the ZeroServer Community Cloud (the author's own platform, driven by the `zs` CLI). This decision was first taken for River Raid, the author's earlier game and the first app on the platform, and Space Invaders has the same server, so the same constraints apply. The first idea was several instances behind one address, with a replicated volume holding the SQLite file. What the platform offers today, from its published manifest reference, its CLI and its roadmap:

- **One instance per app.** There are no replicas or load balancing for an app; high availability of apps is outside the current roadmap cycle.
- **Named volumes are pinned to one node and snapshotted** (encrypted, to object storage, moving to a swarm of community nodes). A volume can be restored on another node from its latest snapshot, but it is **not replicated**: after a failover the writes made since the last snapshot are lost.
- **Replication exists only for the managed PostgreSQL and MySQL** (`zs db create --replicas`, automatic failover).
- The platform runs **prebuilt images only**, and its nodes are a mix of amd64 and arm64 machines.

SQLite cannot simply be shared by instances on different nodes, whatever the volume does: write-ahead logging needs shared memory that only exists on one host, locks over a network or replicated file system are not reliable, and two instances that each write to their own copy would make the board diverge. The server is also built for a single writer: its rate limiter lives in memory and its write path takes the database lock first.

## Decision

- **Deploy one instance, with the SQLite file on a named volume mounted on `/data`.** It is what the platform supports today, it needs no change to the code, and the snapshots give a recoverable board.
- **The path to several instances is the platform's managed PostgreSQL, not a replicated SQLite file.** Storage is behind the `LeaderboardStore` port, so the work is an adapter for PostgreSQL, an asynchronous application layer, and a decision about the rate limiter (shared, or per instance). SQLite stays for development and tests. This is done when the data needs more than snapshots, or when the platform can run more than one instance of an app, whichever comes first.
- **GitHub Actions builds and delivers.** Every pull request is verified; a push to `main` builds a multi-architecture image, publishes it to the GitHub Container Registry and, once switched on, deploys it with the `zs` CLI at a pinned version and checksum, logged in with an API key kept as a repository secret.

## Consequences

- If the node that runs the app is lost, the board comes back from the latest snapshot on another node: the scores of the minutes since that snapshot are lost. The snapshot is taken with the volume quiesced, so the file is consistent.
- There is no redundancy: while the node is down, or while the app is rescheduled, the board is unavailable.
- There is no `exec` in the `zs` CLI, so the moderation command runs on the machine that hosts the container (`docker exec`), which the author operates. Exposing it over HTTP would add an administrative surface this project does not want.
- The rate limiter keys its counters by the address the gateway forwards. `TRUST_PROXY` has to match the number of proxies that append to `X-Forwarded-For` in front of the container: measured on the first app deployed on the platform (River Raid), it is 2 (Caddy and the FRP vhost). To be re-checked for this app; [the deploy guide](../deploy.md) says how.
- The platform reported every redeploy of River Raid, an app with a volume, as failed although it applied it, and `zs deploy` exits 0 whatever happens (to be observed again with this app). The deploy job therefore proves the deploy by asking the app which commit it runs (`/api/health`).

## Alternatives considered

- **PostgreSQL now.** Real data replication and an app ready for several instances, but a bigger change (an asynchronous port, a new adapter and dependency) that does not change the fact that the app runs as one instance today.
- **Litestream to an external object store.** Seconds of data loss instead of the snapshot interval, with no change to the code, but a third-party account and credentials for something the platform's snapshots already cover well enough for a hobby board.
- **LiteFS or another replicated SQLite.** Not available on the platform, and it needs a lease service and write forwarding on top.
- **Several independent apps.** No shared address, and one board per app.

## Related

- [ADR 0002: Global leaderboard API](0002-global-leaderboard-api.md)
- [ADR 0003: Scores are verified by playing the run again](0003-replay-verified-scores.md)
- [Deploying on the ZeroServer Community Cloud](../deploy.md)
