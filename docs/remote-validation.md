# Remote Validation Runner

Written 2026-08-28. Runs the expensive half of the close-out gate on a
disposable cloud VM instead of the developer's machine.

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

| Step | MVP location |
| --- | --- |
| merge candidate ← feature branch | local (`integration-orchestrator.ts`) |
| `bun run build` (conflict-free tree + fresh `dist/`) | local |
| `bun install` + `bun run build` + `bun run test` | **remote VM** |
| build staleness / lockfile / CSS / theme / bare-require guards | local (`repoos check` with `REPOOS_SKIP_TESTS=1`) |
| UI smoke test (Playwright/webkit) | local |

`REPOOS_SKIP_TESTS=1` (see `src/commands/check.ts`) is what the close-out sets
on the local `repoos check` after a remote pass so its Tests step is skipped.
Standalone `repoos check` from the CLI never sets it — the CLI gate is unchanged.

## The two hook points

Both close-out paths call the runner in place of the local test run:

- **`src/server/integration-orchestrator.ts` `validateCandidate`** — the live
  path (since #0118). After the local `bun run build`, if
  `config.remoteValidation.enabled` and a `RemoteValidator` was injected, it
  calls `remoteValidator.validate({ taskId, worktreePath, candidateSha })`, then
  runs the local guards-only `check`.
- **`src/server/done.ts` `completeTask`** — the legacy single-shot path (dead
  code, tests only — see its header comment). Not wired to the runner; if it is
  ever revived, inject a `steps.check` that calls `remoteValidator.validate`.

### Result handling

`validate()` returns a `CheckSummary` (`src/server/done.ts`):

| Outcome | `ok` | `transient` | close-out does |
| --- | --- | --- | --- |
| remote gate green | `true` | — | run local guards with `REPOOS_SKIP_TESTS=1`, then publish |
| remote gate red (build/test failed) | `false` | `false` | **non-retryable** fail — fix in the feature branch and resubmit |
| runner unreachable / provisioning failed / ssh dropped / timed out | `false` | `true` | **retryable** fail, task stays in `review` (resume from the check step) — unless `remoteValidation.fallbackToLocal`, then run the full gate locally |

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

`repoos.toml`:

```toml
[remoteValidation]
enabled = true
serverType = "cax31"           # 8 vCPU Ampere ARM / 16 GB (default). "cpx41" = 8 vCPU AMD x86.
location = "hil"
snapshotId = "123456789"
sshKeyName = "your-key-name"
idleShutdownMinutes = 8
maxServerLifetimeMinutes = 120
fallbackToLocal = false
```

Sizing: the local gate caps the vitest worker pool at 8 (`testPoolSize` in
`src/commands/check.ts`), so 8 vCPU is the sweet spot — a 16-vCPU type buys
nothing for this suite, a 4-vCPU type drops to ~3 workers. `serverType` **must
match the architecture the snapshot was built on** (arm64 for `cax*`, x86 for
`cpx*`/`cx*`).

`.env` (secrets — never a git-tracked TOML key, same rule as `[auth]`):

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
