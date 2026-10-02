---
id: 2026-10-02-0946-deploying-on-zeroserver
title: Deploying on the ZeroServer Community Cloud
type: guide
status: accepted
domain: [deployment, operations]
projects: [space-invaders]
ai_context: false
ai_scope:
  - global
created: 2026-10-02
updated: 2026-10-02
---

How the game goes from a commit on `main` to a public URL, and how to run it there. The reasoning, and why it is one instance and not several, is in [ADR 0004](adr/0004-single-instance-on-zeroserver.md).

This setup was first worked out and run for River Raid, the author's earlier game and the first app on the platform. Whatever below was observed on the platform is marked as such: it was seen there, and is to be re-checked the first time this app is deployed.

## What runs where

```
push to main ─▶ GitHub Actions ─▶ verify ─▶ image (amd64 + arm64) ─▶ ghcr.io/iuriandreazza/space-invaders:sha-<commit>
                                                                         │
                                                  zs deploy (pinned zs, API key)
                                                                         ▼
                              ZeroServer Community Cloud: one instance, SQLite on the volume "leaderboard" (/data)
                                                                         ▼
                                                      https://app-xxxx.apps.zeroserver.cc
```

- [`zs.yaml`](../zs.yaml) is the manifest: one service, one exposed port (8080), one named volume. The deploy job replaces `:latest` in it with the tag of the commit.
- [`zs.toml`](../zs.toml) pins the `zs` profile of the project to `iuripersonal`, so a deploy from this folder never runs as another account of the same machine.
- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) has four jobs:
  1. **verify**, on every pull request and push: lint, tests, build (which type-checks) and `pnpm audit` for high and critical advisories;
  2. **container**, on every pull request and push: builds the image and runs it as the platform will, read-only and without capabilities, with a fresh volume on `/data`: the health check answers and reports the commit the image was built from, the page is served, starting a session writes to the database, the moderation command runs inside the image and the process is not root;
  3. **image**, on a push to `main`, after the two above: builds the image for both architectures (the community nodes are a mix of amd64 and arm64) and publishes it as `sha-<commit>` and `latest`;
  4. **deploy**, on a push to `main`, only when the repository variable `DEPLOY_ENABLED` is `true`: installs the `zs` release recorded in the workflow after checking its SHA-256, logs in with the API key, points the manifest at the new image and runs `zs deploy`. The verdict is not what `zs` prints (see *Quirks of the platform* below) but what the app says: the job waits until `/api/health` at `APP_URL` reports the commit it deployed, and fails after four minutes if it does not.
- Actions are pinned by commit, the workflow asks for read access only (the image job also writes packages), and pull requests never see a secret.

## One-time setup

1. **Let the workflow publish packages.** Nothing to do: the job asks for `packages: write` itself.
2. **Make the image public.** The platform pulls without credentials. On GitHub: *Packages → space-invaders → Package settings → Change visibility → Public* (after the first image was published). Or keep it private and store a token that can only read packages with `zs --profile iuripersonal registry login ghcr.io --username iuriandreazza`.
3. **Create the API key** in the ZeroServer portal, logged in as the personal account, and store it where only the workflow can read it (the command asks for the value without echoing it):
   ```bash
   gh secret set ZS_API_KEY --repo iuriandreazza/space-invaders
   ```
4. **First deploy**, by hand, with the tag of the image you want (the repository file keeps `:latest`):
   ```bash
   mkdir /tmp/space-invaders-deploy && cp zs.yaml zs.toml /tmp/space-invaders-deploy && cd /tmp/space-invaders-deploy
   sed -i '' 's|space-invaders:latest|space-invaders:sha-<commit>|' zs.yaml   # GNU sed: -i without ''
   zs --profile iuripersonal deploy
   zs --profile iuripersonal list          # the URL and the instance id, once RUNNING
   ```
5. **Switch the pipeline on**, with the address `zs list` showed:
   ```bash
   gh variable set APP_URL --body https://app-xxxx.apps.zeroserver.cc --repo iuriandreazza/space-invaders
   gh variable set DEPLOY_ENABLED --body true --repo iuriandreazza/space-invaders
   ```
   That address is also what the link-preview tags need: [`index.html`](../index.html) has none yet, because crawlers only follow absolute URLs and the address did not exist before the deploy. Add the canonical link, `og:url` and `og:image` (with a 1200×630 picture in `public/`) using it.
6. **Check which address the server sees**, because the rate limit depends on it. `TRUST_PROXY` in `zs.yaml` says how many proxies stand in front of the container and append to `X-Forwarded-For`. Redeploy with `LOG_CLIENT_ADDRESS=true`, send a request that is refused (once with a forged `X-Forwarded-For`) and read the log:
   ```bash
   curl -s -X POST -H 'content-type: text/plain' -d x "$APP_URL/api/sessions"      # 415, logged
   zs --profile iuripersonal logs <instance-id> | tail -3                          # the log arrives some seconds later
   ```
   The `client` field has to be your own public address. If it is the address of a proxy, or `unknown`, every player shares one allowance and the value of `TRUST_PROXY` is wrong. Turn `LOG_CLIENT_ADDRESS` off again afterwards: the log is better without addresses.

   **Measured on the first app deployed on the platform (River Raid, 2026-10-01): `TRUST_PROXY=2`; to be re-checked for this app.** The path there was Caddy (the gateway's edge), then the FRP vhost, then the container, and each of the two appends to `X-Forwarded-For`. With `1` the log showed the Docker address of the gateway side (`172.18.0.3`) for everybody, which would have put every player in one rate-limit bucket. With `2` it showed the real client address, and an `X-Forwarded-For` forged by the client changed nothing, because Caddy replaces it. The manifest carries `2` on that evidence; this step is how to confirm it for Space Invaders.
7. **Optional: Google Analytics.** The client reads the measurement id when it is built, so it is a repository variable that the workflow hands to the image build, not something the running container reads:
   ```bash
   gh variable set GA_MEASUREMENT_ID --body G-XXXX --repo iuriandreazza/space-invaders
   ```
   Empty or unset means no analytics: the image is built without an id and the client never loads Google's script. It is a variable and not a secret because the id ends up in the public bundle of the page anyway. The container and the image jobs both pass it as the build argument `VITE_GA_MEASUREMENT_ID`. Changing the variable changes nothing by itself: the next push to `main` (or a manual run of the workflow) builds and deploys an image with the new value. Even with an id built in, the client only loads Google's script after the visitor accepts the consent banner (see [the security review](security.md)).

## Day to day

| What | How |
| --- | --- |
| Deploy | merge to `main`; the pipeline does the rest |
| Deploy by hand | the commands of step 4, with the tag of any published image |
| Roll back | deploy the tag of the previous commit by hand; `zs --profile iuripersonal deployments space-invaders` lists what was deployed and how it ended |
| Change or switch off analytics | change or delete the repository variable `GA_MEASUREMENT_ID`, then run the workflow again (step 7) |
| Logs | `zs --profile iuripersonal logs <instance-id>` (security events are JSON lines) |
| Restart | `zs --profile iuripersonal restart <instance-id>` |
| Volumes and snapshots | `zs --profile iuripersonal volume ls <application-id>`; `volume restore <application-id>` queues a restore from the latest snapshot |
| Moderate the board | on the machine that runs the container: `docker exec <container> node dist-server/server/cli.js list` (the CLI of `zs` has no `exec`) |
| Update `zs` in the workflow | take the new release, put its `zs-linux-x64.sha256` in `ZS_SHA256` and its tag in `ZS_VERSION` |

## Quirks of the platform

Found by deploying River Raid for real (zs 0.14.0, 2026-10-01); not yet observed with this app, and to be re-checked on its first deploys. They are the platform's and are not fixed here; the pipeline is built around them.

- **A redeploy of an app with a named volume is reported as failed, although it works.** Every `zs deploy` after the first swapped the container and applied the new image and environment (the instance stayed `RUNNING` and answered), and then two `FAILED` records followed with `(HTTP code 400) bad parameter - Duplicate mount point: /data`. The backend's rollback path (`buildRollbackServicePayload` in `ReconcileCommandResult`) sends the named volume both as a managed mount and as a raw bind, without the de-duplication that the start path (`buildServiceStartPayload` in `OrchestratorService`) has. `zs logs` returned that error text instead of the log for a few seconds after a deploy.
- **`zs deploy` exits with 0 when the deployment failed**; it only prints it. A script cannot rely on the exit code.
- So the workflow does not trust `zs`: the image carries its commit (`APP_REVISION`, set from the `REVISION` build argument), `/api/health` reports it, and the deploy job waits for the commit it deployed. If the platform one day stops adding the failed records, nothing changes.
- The security log reached `zs logs` some seconds after the event.

## What to expect

- **One instance.** While the node that runs it is down, or while the platform moves the app, the board is unavailable.
- **Snapshots, not replication.** After a failover the board comes back from the latest snapshot of the volume: the scores of the minutes since then are lost. `zs volume ls` shows when the last snapshot was taken.
- **Redeploys keep the data**, because the volume is named and survives them.
- When that is not enough, the next step is the platform's managed PostgreSQL, which is replicated (see ADR 0004).
