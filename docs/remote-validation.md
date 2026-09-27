# Remote Validation Runner

Written 2026-08-28. Updated 2026-09-22 to add the Tailscale provider.
Runs the expensive half of the close-out gate on a remote machine instead of
the developer's machine. Two providers are supported: **hetzner** (disposable
cloud VM, the original) and **tailscale** (persistent machine on your tailnet,
runs the gate in a fresh Docker container).

## Why

The close-out gate (`repoos check`) ends with the full `bun run test` suite. On
this machine, under memory pressure, the subprocess-heavy suites (agent-review,
done-reliability, task-watchdog) swap-thrash and get SIGKILLed mid-run — so
green branches are reported as failed and tasks never reach `done`
(`repoos-check-flakes-under-memory-pressure` in memory; the run of
`merge: recover #03xx` commits on main). Throwing more local workers at it makes
it worse.

The fix: run `bun install` + `bun run build` + `bun run test` on a fresh
Hetzner VM with 16 GB to itself. The cheap static guards (build staleness,
lockfile sync, CSS layering, theme contrast, bare-`require`, and the Playwright
UI smoke test) stay local — they are fast and not the resource problem.

## What runs where

| Step | Pre-review (handoff / `repoos check`) | Close-out (MTD) | Release |
| --- | --- | --- | --- |
| merge candidate ← feature branch | — (not merged yet) | local (`integration-orchestrator.ts`) | — |
| `bun run build` (conflict-free tree + fresh `dist/`) | — | local | local |
| `bun install` + `bun run build` + `bun run test` | **remote runner** (worktree `HEAD`) | **remote runner** (merged candidate `HEAD`) | **remote runner** only when `remoteValidation.useForReleases = true`, else local |
| build staleness / lockfile / CSS / theme / bare-require guards | local (`repoos check` with `REPOOS_SKIP_TESTS=1`) | same | same |
| UI smoke test (Playwright/webkit) | local | local | local |

`REPOOS_SKIP_TESTS=1` (see `src/commands/check.ts`) is what both paths set on the
local `repoos check` after a remote pass so its Tests step is skipped.
`REPOOS_REMOTE_VALIDATION_DONE=1` is set when a parent already ran the remote
gate (including `fallbackToLocal` fallback) so a spawned `repoos check` does not
run it again. Server-spawned checks also pass `--local-tests` when remote is
enabled but that path opted out (e.g. release with `useForReleases = false`,
close-out without a build step). With `remoteValidation.enabled`, standalone
`repoos check` runs the remote half first unless you pass `--local-tests`, use
`--changed` / `REPOOS_CHECK_CHANGED` (fast local pre-review only), or either env
var is already set. The remote bundle is **`git bundle create … HEAD`**, so only
committed work reaches the runner, and local tests are skipped after a green
remote pass. What is tested must be what is committed (#0512), which the two
entry points guarantee differently:

- **Handoff** commits the worktree first (the commit gate runs before the check),
  so the sha the runner tests already contains everything the agent wrote.
- **Standalone `repoos check`** on a tree with uncommitted work does not use the
  remote gate: it prints which files are uncommitted and runs the full local gate
  on the working tree instead. An unreadable git status counts as dirty.

`REPOOS_SKIP_TESTS=1` counts as "remote already ran" on purpose: close-out and
release set it after their own remote pass, and a user who exports it has asked
for the test suite to be skipped. A failed handoff remote gate is recorded as a
check run (Debug tab), and a failed CLI run awaits runner teardown before exiting
so it cannot leak a warm VM. Repos with remote validation off behave as before.

## Hook points

The pre-review, close-out and release gates share `runRemotePreReviewGate` (`src/server/pre-review-remote-gate.ts`); the legacy single-shot path does not:

- **Pre-review** — engineer handoff finalization (`src/server/handoff.ts`) and
  `repoos check` when `remoteValidation.enabled` (task #0520). Bundles the task
  worktree at `HEAD`, runs install + build + test on the runner, then local
  guards with `REPOOS_SKIP_TESTS=1`. Logs land in
  `.repoos/logs/remote-validation/<taskId>.log` (task id, or `pre-review` for a
  bare CLI run).
- **Close-out** — **`src/server/integration-orchestrator.ts` `validateCandidate`**
  (since #0118). After the local `bun run build` on the merged candidate, same
  remote + local-guards sequence as pre-review.
- **Release** — `src/server/release.ts`. Same remote + local-guards sequence, but
  only when `remoteValidation.useForReleases = true` (off by default: a release is
  watched live and the provisioning delay reads as a regression). Otherwise the
  release runs the full local gate and passes `--local-tests` so the CLI does not
  auto-run remote.
- **`src/server/done.ts` `completeTask`** — legacy single-shot path (dead code,
  tests only). Not wired to the runner; if revived, inject remote validation the
  same way.

### Pre-review unreachable-runner policy

Same as close-out: `remoteValidation.fallbackToLocal` (Settings → Remote
validation). When **false** (default), an unreachable runner fails **retryably**
on handoff (the server may auto-resume the engineer) and fails `repoos check`
with a non-zero exit. A **red** remote gate (build/test failed on the runner) is
**non-retryable** — fix the branch and re-run. When **fallbackToLocal** is true,
the full local test suite runs instead.

### Result handling

`validate()` returns a `CheckSummary` (`src/server/done.ts`):

| Outcome | `ok` | `transient` | close-out does |
| --- | --- | --- | --- |
| remote gate green | `true` | — | run local guards with `REPOOS_SKIP_TESTS=1`, then publish |
| remote gate red (build/test failed) | `false` | `false` | **non-retryable** fail — fix in the feature branch and resubmit |
| runner unreachable / provisioning failed / ssh dropped / timed out | `false` | `true` | **retryable** fail (close-out: task stays in `review`; pre-review handoff: may auto-resume the engineer) — unless `remoteValidation.fallbackToLocal`, then run the full gate locally |

## VM lifecycle

`src/server/remote-validation.ts` + `src/server/hetzner.ts`.

- **Provision** (`ensureRunner`): reuse the tracked VM if it is still `running`
  and younger than `maxServerLifetimeMinutes`; otherwise `POST /servers` from
  `snapshotId`, poll to `running`, then TCP-probe port 22. Serialised through
  one in-flight promise — **never more than one VM**. State (`serverId`, `ip`,
  `createdAt`) is cached in `.repoos/remote-runner.json` (a convenience, not a
  source of truth).
- **Transport**: `git bundle create … HEAD` of the merged candidate worktree,
  `scp` to the VM. Self-contained — nothing is pushed to GitHub, no dependency
  on `origin` freshness.
- **Execute**: `ssh` → `/opt/repoos/validate.sh <bundle> <sha>` (see
  `scripts/remote-runner/`), which asserts `git rev-parse HEAD == <sha>` and
  runs the gate inside the prebuilt `repoos-ci` container with a persistent
  `/var/cache/repoos/bun` volume. Combined output streams to
  `.repoos/logs/remote-validation/<taskId>.log` and the caller's `onChunk`.
- **Teardown**: an idle timer (`idleShutdownMinutes`, default 8) deletes the VM
  after the last job; a hard `maxServerLifetimeMinutes` timer (default 120)
  force-deletes it even mid-job as a cost stop-loss.
- **Leak control**: every VM carries the label `repoos-ci=1`.
  `reconcile()` runs at server boot (nothing is validating then) and deletes
  every labelled VM. `ensureRunner` also deletes any stray labelled VM before
  creating a new one.

## Config

### Tailscale provider

`repoos.toml`:

```toml
[remoteValidation]
enabled = true
provider = "tailscale"
tailscaleHost = "mybox.tail1234.ts.net"   # or 100.x.x.x
tailscaleUser = "root"                     # default "root"
containerImage = "repoos-ci"               # default "repoos-ci"
fallbackToLocal = false
```

`.env`:

```
REPOOS_REMOTE_SSH_KEY=/abs/path/to/private_key
```

The key must be authorised on the tailscale host (in `~/.ssh/authorized_keys`
for `tailscaleUser`). No Hetzner token is needed.

**One-time setup on the tailnet host:** install Docker (or Podman aliased as
`docker`), pull the `repoos-ci` image, and create the bun-cache volume:

```sh
docker pull repoos-ci
docker volume create repoos-bun-cache   # or mkdir -p /var/cache/repoos/bun
```

Runs are limited by `remoteValidation.maxConcurrent` (default **1**, Settings →
Remote validation). The limit is a FIFO queue inside the server's single runner
instance, so **every server-side caller shares it** — engineer handoff,
close-out and release. A run that has to wait logs `[queued behind N other remote
run(s) …]` in its remote-validation log and starts when a slot frees. Why one:
two full suites on one machine cause load-induced timeouts and timing-sensitive
test failures, and a remote failure is reported as a red gate ("fix it in the
branch"), so contention would blame a branch that is fine. Raise it only for a
host with headroom. A standalone `repoos check` is its own process and is **not**
counted against the server's queue; multiple hosts are a separate problem (#0521).
Waiting counts against the caller's own deadline (handoff has 10 minutes), so a
long queue can time a handoff out.

Each run also gets its **own bundle and artifacts path** on the host
(`/tmp/repoos-<task>-<id>.bundle`, `/tmp/repoos-artifacts/<task>-<id>/`, passed to
`validate.sh` as its third argument) so overlapping runs never delete each other's
logs; artifact dirs older than a day are pruned. The scripts on the host are
copies: after updating RepoOS run `just setup-<host>` again, otherwise an old
`validate.sh` ignores the third argument, keeps using the shared
`/tmp/repoos-artifacts`, and the per-run log download finds nothing (the verdict
is unaffected).

### Hetzner provider (original)

`repoos.toml`:

```toml
[remoteValidation]
enabled = true
provider = "hetzner"                       # default when omitted
serverType = "cax31"           # 8 vCPU Ampere ARM / 16 GB. "cpx41" = 8 vCPU AMD x86.
location = "hil"
snapshotId = "123456789"
sshKeyName = "your-key-name"
idleShutdownMinutes = 8
maxServerLifetimeMinutes = 120
fallbackToLocal = false
```

Sizing: the local gate caps the vitest worker pool at 8 (`testPoolSize` in
`src/commands/check.ts`), so 8 vCPU is the sweet spot. `serverType` **must
match the architecture the snapshot was built on** (arm64 for `cax*`, x86 for
`cpx*`/`cx*`).

`.env`:

```
HETZNER_API_TOKEN=...
REPOOS_REMOTE_SSH_KEY=/abs/path/to/private_key
```

`enabled` and `fallbackToLocal` are also in the Settings UI (both
restart-required). Everything else is TOML-only.

## Cost

Hetzner Cloud bills **by the hour, rounded up** — not per minute — capped at the
monthly rate. Approx (check the console for current numbers):

- `cax31` ≈ €0.017/h (~€12.5/mo cap); `cpx41` ≈ €0.032/h (~€23/mo cap).
- Primary IPv4 ≈ €0.60/mo. Snapshot storage ≈ €0.012/GB·mo (~€0.10–0.15/mo).
- One isolated validation ≈ boot (~45 s) + run (~10–15 min) + idle grace
  (`idleShutdownMinutes`), so ≈ 1 billed hour ≈ **€0.017 (cax31) / €0.032
  (cpx41)**. Consecutive close-outs within that hour reuse the warm VM for free.
- `maxServerLifetimeMinutes` caps a stuck job's worst case.

## Security

Enabling this **sends repo contents to Hetzner** (the git bundle). That is why
`enabled` defaults `false`. The bundle and any secrets in output are redacted in
the failure `reason` (`redactSecrets` in `done.ts`), but the working tree itself
is not — do not enable on a repo with secrets in-tree.

## Rebuilding the snapshot

See `scripts/remote-runner/build-snapshot.md`. Rebuild whenever
`Dockerfile.ci`, its base image, or `validate.sh` changes.

## Future (not in the MVP)

Abstract job/provider model, a worker pool, per-task autoscaling, and live log
streaming into the browser SSE feed (today logs are a file + the failure tail,
matching how the pipeline surfaces gate output).
