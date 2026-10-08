# Remote Validation Runner

Written 2026-08-28. Updated 2026-09-22 to add the Tailscale provider,
2026-09-27 to pool multiple Tailscale hosts (#0521), and 2026-10-06 for
incremental bundle upload via a per-host mirror (#0717).
Runs the expensive half of the close-out gate on a remote machine instead of
the developer's machine. Two providers are supported: **hetzner** (disposable
cloud VM, the original) and **tailscale** (one or more persistent machines on
your tailnet). A tailscale host runs the gate one of two ways, set per host
(default: Docker — see "Docker vs. native" below): in a fresh Docker
container (Linux or macOS via Docker Desktop), or, on macOS only, natively
with no Docker at all. Both are real, maintained setup paths.

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
`repoos check` runs the remote half first unless you pass `--local-tests` or either env
var is already set. **`--changed` / `REPOOS_CHECK_CHANGED` scopes the remote test step too** (#0695): engineer self-checks bundle the merge-base ref alongside `HEAD` and run `bun run test -- --changed <ref>` on the runner (install + build still run). Handoff and close-out omit `changedRef`, so they still run the **full** suite on the runner. Each run bundles only what the host does not already hold when possible (#0717): RepoOS probes a persistent bare mirror on the host (`~/.repoos-cache/<repo>-<hash>.git`), and when the mirror contains a commit the candidate descends from, the upload is a partial **`git bundle create … <base>..<candidate>`** (kilobytes, not the full history). The first run on a host, a cleared mirror, or a probe failure falls back to a full bundle; `validate.sh` still hard-verifies `git rev-parse HEAD == <expected-sha>`. Only committed work reaches the runner, and local tests are skipped after a green remote pass. What is tested must be what is committed (#0512), which the two
entry points guarantee differently:

- **Handoff** commits the worktree first (the commit gate runs before the check),
  so the sha the runner tests already contains everything the agent wrote.
- **Standalone `repoos check`** uses the remote gate with the **Tailscale**
  provider, or **any provider when the engineer is a managed agent** (`REPOOS_AGENT=1`): the check uses the board checkout's runner state so Hetzner's warm VM stays server-owned (#0694). Hetzner without a managed agent still runs the full local gate and says so; handoff and close-out still use the runner.
- **Standalone `repoos check`** on a tree with uncommitted work: a **managed engineer** gets an automatic WIP checkpoint commit on the task branch so the bundle matches the working tree; other callers print which files are uncommitted and run the full local gate instead.

`REPOOS_SKIP_TESTS=1` counts as "remote already ran" on purpose: close-out and
release set it after their own remote pass, and a user who exports it has asked
for the test suite to be skipped. A failed handoff remote gate is recorded as a
check run (Debug tab), and a failed CLI run awaits runner teardown before exiting
so it cannot leak a warm VM. Repos with remote validation off behave as before.

## Hook points

The pre-review, close-out and release gates share `runRemotePreReviewGate` (`src/server/pre-review-remote-gate.ts`); the legacy single-shot path does not:

- **Pre-review** — engineer handoff finalization (`src/server/handoff.ts`) and
  `repoos check` when `remoteValidation.enabled` (task #0520, #0694). Bundles the task
  worktree at `HEAD`, runs install + build + test on the runner, then local
  guards with `REPOOS_SKIP_TESTS=1`. When `remoteValidation.engineerSelfCheckRemote`
  is on (default), a managed engineer's self-check uses the same remote half; handoff
  **reuses** a green remote row in `.repoos/checks.db` at the same `candidate_sha`
  instead of running twice. Reuse is keyed on `git rev-parse HEAD` after handoff's
  commit gate (and auto-format): if the engineer's last self-check ran on an earlier
  sha — common when handoff-only formatting landed afterward — handoff still runs the
  full remote gate once. Task activity records which host ran the self-check and
  how long it took. Logs land in
  `.repoos/logs/remote-validation/<taskId>.log` (task id, or `pre-review` for a
  bare CLI run). Alongside it, `<taskId>.events.ndjson` records the same run's
  structured outcomes — the host, the exit code, and any infra/config failure —
  so a failed or skipped run is legible straight from the task's Debug tab
  (`GET /api/tasks/:id/remote-validation/events`) without opening the raw log
  (#0568).
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
the full local test suite runs instead. A **routing/config failure** (no host
provides a capability the plan's `runsOn` requires) is also non-retryable, but
its detail is `remote validation cannot run: …` pointing at the host
configuration — and it never falls back locally even when `fallbackToLocal` is
true, because running the job on the wrong machine is exactly the outcome
capability routing exists to prevent.

### Result handling

`validate()` returns a `CheckSummary` (`src/server/done.ts`):

| Outcome | `ok` | `transient` | close-out does |
| --- | --- | --- | --- |
| remote gate green | `true` | — | run local guards with `REPOOS_SKIP_TESTS=1`, then publish |
| remote gate red (build/test failed) | `false` | `false` | **non-retryable** fail — fix in the feature branch and resubmit |
| no host provides a required capability (`configError`) | `false` | `false` | **non-retryable** fail — `remote validation cannot run…`; fix the `remoteValidation` host config, never a local fallback |
| runner unreachable / provisioning failed / ssh dropped / timed out | `false` | `true` | **retryable** fail (close-out: task stays in `review`; pre-review handoff: may auto-resume the engineer) — unless `remoteValidation.fallbackToLocal`, then run the full gate locally |
| transient failure on host A (`timeout`, `Killed`, `Broken pipe`) with `retryOtherHosts = true` | `false` | `true` | Retries on the next healthy, free host that hasn't been tried this run; only after every eligible host has failed does the table's retryable/fallback behaviour apply. Non-transient (red gate, `configError`) never retries. Default `true` when 2+ hosts configured. |
| hung run (no output for `hangIdleMinutes` on an idle host) | `false` | `true` (`hung: true`) | The run's container is killed, the outcome is recorded as `hung`, and the run retries on another host exactly like a transient failure (#0729). |

### Retry on other hosts (`retryOtherHosts`)

When `remoteValidation.retryOtherHosts` is `true` (default when 2+ `tailscaleHosts` are configured), a transient failure (`timeout`, `Killed`, `Broken pipe`, host unreachable mid-run) on host A retries the full run on the next healthy, free host that was not already tried this run. The guarantee lives in the pool: `acquire` takes an `excludeHosts` list and never leases a host on it, so a retry cannot re-run the host that just failed, and the loop ends the moment no untried eligible host remains. Only after every eligible host has failed does the existing `fallbackToLocal` / retryable behaviour apply — and when the retry itself cannot start (every eligible host spent or unreachable, or the caller's deadline expired while queued), the run keeps the last attempt's real summary instead of a synthesized dispatch error. A non-transient failure (`ok: false`, `transient: false` — a real red gate or `configError`) never retries; it is the branch's fault, not infra. A host is never retried twice within one run (`triedHosts` set), and the caller's `deadlineAt` is respected across all attempts: a queued retry cancels itself the same way as the first attempt, and a deadline-cancelled attempt is not retried.

In the run log and structured events, each attempt records which host ran it (`[runner user@host]`), the exit code, and whether it was `infra` — so a retry history is fully visible in the task's Debug tab (`GET /api/tasks/:id/remote-validation/events`) without opening the raw log. Each attempt also lands its own check-run history row attributed to its host.

Set it in `repoos.toml` (`remoteValidation.retryOtherHosts`), in Settings → Remote validation (the switch above the provider tabs), or via the CLI (`repoos update <id> --body` never edits it — the Settings form is the UI path).

### Hung runs (`#0729`)

On 2026-10-06/07 two validation containers hung with the host idle (load ~0)
while the log looped `error: Module not found
"/repo/node_modules/vitest/dist/workers/forks.js"` — the run never finished on
its own and a human had to notice. **Confirmed root cause (2026-10-07, #0729):**
an older `validate.sh` startup loop removed every `$HOME/.repoos-validate.*`
workdir before the sibling run's container existed, which could empty `/repo`
mid-run (direct `docker exec` evidence on a live host). **Not proven for that
incident:** concurrent writers corrupting the shared `repoos-bun-cache` volume —
that remains a plausible failure mode the per-slot cache change guards against,
not something the forks.js loop alone established.

Three changes close that hole:

- **Per-slot cache isolation.** Each run's `bun install` writes its own cache
  volume, derived from the host-lock slot the run acquires
  (`repoos-bun-cache-slot<N>`; slot 0 keeps the original `repoos-bun-cache` so a
  warm cache is still reused by the first run). Two runs that may overlap on one
  host (`maxConcurrent > 1`) can no longer observe each other's partial install.
  `cacheVolumeForSlot()` is the pure helper; `validate.sh` reads the slot index
  the host-lock wrapper exports as `REPOOS_SLOT`.
- **A per-run container name.** Every run gets `--name repoos-validate-<runId>`,
  and `validate.sh` removes *that* container in its `EXIT` trap. A hang is killed
  precisely by name — never a blanket `docker kill` that could take a sibling
  run's container. `validateContainerName()` / `killContainerCommand()` build the
  name and the command.
- **A hang watchdog.** While a run streams, the runner samples the host's load
  and watches the output clock. If the output has not advanced for
  `hangIdleMinutes` (default **5**) *and* the host is idle (1-min load per CPU
  below `HANG_IDLE_LOAD_THRESHOLD`, `0.5`), the run is declared **hung**: the
  runner removes that run's container, records the outcome as `hung`
  (check-run history + structured event + the task's remote-validation log), and
  returns a transient failure so `retryOtherHosts` retries it on another host.
  Unknown load is never treated as idle. Tune the threshold with
  `repoos.toml` /
  Settings (`remoteValidation.hangIdleMinutes`).

**Cleanup.** Each run removes **only its own** `$WORK` tree and container in
`validate.sh`'s `EXIT` trap — there is no global workdir sweep at startup
anymore. Containers left behind by a killed/hung run are reaped two ways: that
per-run trap, and the host prerequisite probe's **stale-container** sweep
(`staleContainerCleanupCommand()`) — `repoos-validate-*` name prefix only, and
**not** `status=running`, so a live sibling run is never removed. Safe GC of
abandoned workdirs (age-bound, mount-aware) is deliberately future work; until
then, rely on per-run EXIT cleanup plus non-running container sweeps.

**Bounded kill and slot release (#0739).** The hang kill is a separate SSH
round-trip (30 s cap), raced against a **local** hard deadline so a wedged SSH
client cannot hold the slot even when it ignores `timeoutMs`. When it finishes —
or when either deadline fires — the runner SIGKILLs the main validate SSH if it
is still open, releases the pool
slot immediately (so `HUNG · KILLING` does not stick for the rest of the
outer run timeout), settles the in-flight `validate()` transport via a third
`Promise.race` competitor (so a wedged main SSH with a no-op abort cannot stay
pending after the slot frees — manual `killHungValidation` uses the same
settle path), and issues a follow-up cleanup SSH that removes that run's bundle
and artifacts dir. A kill SSH timeout marks the host **unhealthy**
(degraded) with a clear detail string. Stale `~/.repoos-*-*.bundle` files older
than one day are pruned on every host probe (`staleBundlePruneCommand()`).

**Not a hang after the gate exits (#0739).** Once the stream contains
`[validate] gate exit N`, the watchdog stops: a container that lingers after a
real red gate is a finished failure (`transient: false`), not a hung retry on
another host. If the main validate SSH stays open after that marker, the runner
SIGKILLs it after the same 30 s cap used for hang kills and reports exit `N`
from the streamed output.

**Visibility.** The Remote runners tab shows a run being killed as `hung ·
killing`, and a per-host **Hung runs** row listing the recent kills and when
they happened, so a hang is visible even after the retry moved elsewhere.

**CTO safe action.** The explicit kill-and-retry is the allowlisted
`kill-hung-validation` action (`#0688` — rate limited, audited in the attention
bell, invokable from the API/UI). The automatic watchdog is infra and always
runs; the CTO action is the recovery path when the automatic kill did not land
(e.g. the SSH connection dropped for the kill command too). Add it to
`cto.actions` to let the CTO retry the kill itself.

## VM lifecycle

`src/server/remote-validation.ts` + `src/server/hetzner.ts`.

- **Provision** (`ensureRunner`): reuse the tracked VM if it is still `running`
  and younger than `maxServerLifetimeMinutes`; otherwise `POST /servers` from
  `snapshotId`, poll to `running`, then TCP-probe port 22. Serialised through
  one in-flight promise — **never more than one VM**. State (`serverId`, `ip`,
  `createdAt`) is cached in `.repoos/remote-runner.json` (a convenience, not a
  source of truth).
- **Transport**: bundle the candidate worktree (partial when the host mirror
  holds a usable base, otherwise full `HEAD`), upload over SSH. Failed uploads
  retry up to three times without restarting the whole validation run. The run
  log and structured events record bundle size and upload seconds. Self-contained
  — nothing is pushed to GitHub, no dependency on `origin` freshness.
- **Execute**: `ssh` → `/opt/repoos/validate.sh <bundle> <sha> [artifacts]
  [changed-ref] [mirror-path]` (see `scripts/remote-runner/`). When
  `mirror-path` is set, the bundle is fetched into the host mirror and the
  candidate is checked out from there; otherwise the script clones the bundle
  directly. Either way it asserts `git rev-parse HEAD == <sha>` and runs the
  gate inside the prebuilt `repoos-ci` container with a per-slot bun cache
  volume (isolated so concurrent runs can't corrupt each other's installs,
  #0729) and a per-run `--name repoos-validate-<runId>` so a hang can be killed
  precisely. Combined output streams to
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
tailscaleHost = "mybox.tail1234.ts.net"   # single-host shorthand (or 100.x.x.x)
tailscaleUser = "root"                     # default SSH user (per-host user wins)
containerImage = "repoos-ci"               # Linux hosts' Docker image
fallbackToLocal = false
retryOtherHosts = true         # retry on another healthy host before giving up (default true with 2+ hosts)
maxConcurrent = 1                          # global per-host limit (see below)
```

The host pool (#0521) — every machine jobs may be dispatched to — can be
written two ways. **Pick one per host**; showing both together for the same
host in one example, as an earlier version of this doc did, is not valid
standard TOML (you cannot define a key as both a plain value and
`[[table-array]]` blocks) even though RepoOS's own tolerant parser accepts
it — the two forms below are separately valid files, not one combined file:

**Plain list** — hosts with no per-host attrs to set. Also editable in
Settings → Remote validation ("Host pool"). Saving the list updates the
running dispatcher immediately (no restart); in-flight jobs on a removed
host finish there, and new jobs use the saved pool.

```toml
[remoteValidation]
tailscaleHosts = ["bee", "mac1"]
```

**Rich rows** — one `[[remoteValidation.tailscaleHosts]]` block per host that
needs its own settings (a host may still appear in the plain list too, for
others with no attrs — the two merge, just never redefine the *same* host in
both):

```toml
[[remoteValidation.tailscaleHosts]]
host = "mac1"
user = "nick"          # SSH user for this host (default tailscaleUser, else root)
os = "macos"           # capability: jobs with runsOn = ["macos"] land here
runner = "docker"      # HOW this host runs validate.sh: "docker" (default) or
                        # "native" — see "Docker vs. native" below. Optional;
                        # omit for the default (docker).
labels = ["apple-silicon"]  # extra capabilities jobs can require
maxConcurrent = 2      # this host's own in-flight cap (default maxConcurrent, else 1)
```

`user`/`os`/`labels`/`maxConcurrent`/`runner` are TOML-only — there is no
Settings UI for per-host rows (only the plain host-name list is editable
there). This is a deliberate exception to the "every feature setting needs a
Settings control" rule (AGENTS.md, Conventions): per-host attrs are advanced,
infrequently-changed configuration where a dedicated UI would add real
complexity for little benefit over editing the row directly.

`.env`:

```
REPOOS_REMOTE_SSH_KEY=/abs/path/to/private_key
```

The key must be authorised on every tailscale host (in `~/.ssh/authorized_keys`
for that host's user). No Hetzner token is needed.

### Docker vs. native — both are real, maintained options

A host runs `validate.sh` one of two ways, set per-host via `runner` (default
`"docker"` when omitted — this is the field that decides it, NOT `os`, which
is a separate, purely capability-routing concept: `os` says what platform a
host provides for `runsOn` matching; `runner` says how that host actually
executes the gate, and either runner satisfies the same `os` capability
since the result is identical either way):

- **`runner = "docker"` (default).** Linux or macOS, in a fresh `repoos-ci`
  container. Requires Docker (Docker Desktop on macOS).
- **`runner = "native"` (macOS only today).** No Docker: `bun install` +
  `bun run build` + `bun run test` directly on the host.

**One-time setup per host.** The `just` recipes are the maintained path for
both:

```sh
just setup-bee                          # Linux (Arch), Docker
just setup-thinkpad                     # Linux (Arch), Docker
just setup-mini                         # macOS, Docker (Docker Desktop)
just setup-mini-native                  # macOS, native — no Docker
just _setup-runner <host> <arch|macos>         # any other Docker host
just _setup-runner-native <host>               # any other native macOS host
```

Each installs the matching `validate.sh` at `/opt/repoos/validate.sh` on the
host. **Set `runner` on that host's config row to match what you installed**
— the per-host prerequisite probe (below) checks the toolchain `runner` says
to expect, so a mismatch (e.g. a native install left at the default
`runner = "docker"`) reports the host unhealthy even though it works.

Two prior versions of the probe got this wrong in opposite directions by
branching on `os` instead of a dedicated `runner` field (#0521 review, twice
over): checking bun/git unconditionally on macOS (fails a real
Docker-provisioned macOS host) and checking Docker unconditionally
everywhere (fails a real native macOS host). `runner` is what fixes this —
it says explicitly which toolchain a given host uses, independent of its
platform.

The scripts on hosts are **copies**: after updating RepoOS re-run the setup
above, otherwise an old `validate.sh` ignores the third (artifacts) argument —
the per-host prerequisite check below reports exactly that.

#### Rolling out incremental bundle upload (#0717 / #0725)

RepoOS 2026-10-07+ uploads partial git bundles when the host's installed
`validate.sh` understands the optional **mirror-path** argument (the copy in
`scripts/remote-runner/validate.sh` in this repo). The prerequisite probe
(`grep MIRROR` on `/opt/repoos/validate.sh`) caches that per host:

- **Current script** — RepoOS probes the host mirror, uploads only new commits
  when possible, and passes the mirror path as the fifth argument.
- **Older script (pre-mirror)** — RepoOS still works: it sends a full `HEAD`
  bundle and calls `validate.sh` with the legacy four-argument layout (bundle,
  sha, artifacts dir, optional changed ref). The server logs that the runner
  script is old and surfaces **legacy (full bundle only)** plus a one-line
  install command on the Remote runners tab and in Settings → Remote validation.
- **Mismatch** — If an incremental bundle fails with "cloned an empty
  repository" or a transport exit 3, the server retries **once** with the legacy
  full bundle and remembers that host as legacy until you update `validate.sh`.

Update every pool host after pulling a RepoOS release that includes #0717:

```bash
# Example — replace bee with your host alias; needs sudo on the host.
ssh bee 'git clone --depth 1 git@github.com:repo-os/repoos.git ~/.repoos-build && \
  sudo install -Dm755 ~/.repoos-build/scripts/remote-runner/validate.sh /opt/repoos/validate.sh && \
  rm -rf ~/.repoos-build && echo done'
```

Or re-run `just setup-<host>` / `just setup-<host>-native`, which installs the
same file. No server restart is required — the probe result refreshes on the
next health check.

#### The gate container (`repoos-ci`) and project-specific images

The default `remoteValidation.containerImage` is **`repoos-ci`**: the image RepoOS
uses to dogfood its own repo (`Dockerfile.ci` in this repository). It is a
generic Bun + git + Node toolchain — **no Postgres or other services**. Inside
the container, `/opt/repoos/validate.sh` runs a **fixed** sequence (not your
project's `[[check.steps]]` plan):

`bun install --frozen-lockfile && bun run build && <repoos dist shim> && bun run test`

That shim exists so the in-container `repoos check` matches RepoOS self-hosting;
other projects still get `bun install`, `bun run build`, and `bun run test` only.

**Other repos** can reuse the same pattern with their own image name in
`containerImage`, but you must build and tag that image **on every pool host**
(the CPU architecture differs per machine — arm64 vs amd64). There is no
`repoos runner build-image` helper yet; build locally and load or push per host.

Before your entrypoint runs, RepoOS pre-flight may execute `docker run -u 0 …`
as root to `chown` the persistent bun-cache volume. A custom image must **tolerate
that root invocation** (pass through to your normal entrypoint or no-op safely).

Projects whose tests need Postgres, Redis, or similar must ship a **project CI
image** that starts those services (or embeds them) and adjust `validate.sh` on
each host accordingly — the stock `repoos-ci` gate will not satisfy them. A
future `remoteValidation.command` override is not implemented yet; today the
remote half is always the `validate.sh` contract above.

When remote validation is enabled but every host is unreachable or fails its
probe, close-out and handoff may still run the **full local gate** if
`fallbackToLocal = true`. That shows up in `.repoos/checks.db` on the local row
(`Ran locally: no healthy runner …`) and in the notification bell (#0687) — it
is not silent success.

#### Dispatch, health and queueing (#0521)

Each job goes to an **idle host that satisfies its requirements**; it queues
only when *every* eligible host is at its per-host limit, in FIFO order, and a
macOS-only waiter never blocks a Linux job. Limits are per host
(`maxConcurrent` per host → `remoteValidation.maxConcurrent` → 1), so two jobs
run on two hosts while a third waits. A run that has to wait logs
`[waiting for a runner on <host> (queue position N) — queued behind …]` in its
remote-validation log and in the caller's output (repeated on a heartbeat while
it waits), and the log records which host ran each job
(`[runner user@host (os)]`).

When eligible hosts have the same number of active runs, the configured host
order breaks the tie: hosts are tried from top to bottom, so the first host
receives a run when all are idle. The Checks → Remote runners tab has up/down
controls for plain string pools and saves their order immediately; in-flight
runs keep their existing host. A configured `tailscaleHost` shorthand pins its
host first only when there is no non-empty `tailscaleHosts` list. Remove the
shorthand from `repoos.toml` to let the list order control that host. Pools
using `[[remoteValidation.tailscaleHosts]]` rows are shown read-only in the
tab; edit their order in `repoos.toml`.

Before a host's first job it is probed over SSH (and again on a timer while
the server runs, without opening the Checks UI — #0683): reachability, the toolchain
its `runner` says to expect — Docker, the configured `containerImage`
actually present (not just the daemon reachable — a daemon up with the
image never built/pulled used to report healthy, then fail every job it
got, #0521 review), or bun/git for a native host — see "Docker vs. native"
above — **the bun cache is actually writable by whoever will write to it**
(native: a plain host-path write-then-remove, since bun runs as the SSH
user directly; Docker: the exact sequence `validate.sh` runs against the
named cache volume (`repoos-bun-cache`, or the per-slot
`repoos-bun-cache-slot<N>` — see "Per-slot cache isolation") — chown it to the container's uid as root,
then write as that uid — proved live against a real macOS/Colima host
rather than approximated, after two earlier, narrower versions of this
check both turned out insufficient in successive review rounds: first it
tested only the SSH user's own — trivially true — access to a *host
directory*; second it added a host-side `chmod`, which is invisible to the
container on macOS/Colima, whose bind-mount view maps a host directory to
root:root 0755 inside the VM regardless of the real host-side permissions.
A named volume sidesteps that host-filesystem-mapping problem entirely) —
and an **up-to-date `validate.sh` that accepts the artifacts dir as
its third argument** (mirror upload support is detected separately — see
"Rolling out incremental bundle upload" above). A host that fails is reported instead
of failing jobs — its state and reason show in Settings → Remote validation
(Hosts) and in `GET /api/remote-validation/status` (`hosts[]` with `probed`,
`healthy`, `detail`, `inFlight`, `queued` — each waiting run counted against the
one host it would run on next, so the column totals sum to the real queue
length — `lastRun` with the run's duration, and #0564's `activeRuns`
(task id + start time of each in-flight run) plus `queuedTasks`, the FIFO
next-up task ids attributed to that host). The Checks page's **Remote runners**
tab renders the same payload live, including a per-host **Server stats** row
with load averages, CPU count, memory use/total, free space on the remote
user's home work area, and sample time. **Health probes** (ready/unready above)
run at server boot and every minute on unhealthy hosts; they do not need the
Checks tab open. **Server stats** samples are different: while the Remote
runners tab is open, it requests read-only SSH samples every 15 seconds with a
five-second timeout; those samples do not acquire a run slot or wait behind
validation jobs. Unsupported commands, failed SSH, and unreachable hosts show
unavailable values rather than blocking the status page. Host state is in-memory
per server process;
the durable record of what actually ran lives in the check-run history
(`.repoos/checks.db`, below) — it is skipped while
other hosts are healthy, and re-probed later (30 s cooldown, capped at 10
retries) so it rejoins the pool when it comes back. SSH timeouts and refused
connections surface as **host unreachable** with a hint to check Tailscale login
on that machine (#0683). Once a host hits that cap
its retries stop; a queued run whose eligible hosts have **all** hit it is
cancelled and fails retryably rather than waiting forever (release, and
close-out with `closeOut.timeoutMs = 0`, pass no deadline of their own;
close-out otherwise passes its pipeline budget — #0573). A run whose every
eligible host is unusable fails retryably with each host's reason.

#### Check-run history (#0564)

Every remote validation run — pass, fail, or never dispatched — is recorded as
one row in `.repoos/checks.db` (`src/core/check-store.ts`), attributed to the
host that ran it (`machine`, `remote = 1`) and to the gate that called it
(`phase`: pre-review, close-out, release, or cli). The local `repoos check`
half records its own row the same way, so a gate that used the runner shows as
two rows: the remote suite on the host, then the local guards on this machine.

#### Capability routing (`runsOn`)

A `[[check.steps]]` row can declare `runsOn = ["macos"]` (any capability
string; a host provides its `os` plus its `labels`, case-insensitive). The
job's requirement is the union of `runsOn` across only the plan's `build`-
and `tests`-kind steps — NOT every step. The remote host never runs the
check plan step-by-step; `validate.sh` runs the fixed sequence
`bun install && bun run build && bun run test`, which is exactly the work
those two kinds represent. A step of any other kind (or a raw custom
`command` step), even one declaring its own `runsOn`, always runs locally as
part of `repoos check` regardless — so its capability requirement must not
constrain which remote host the job needs (a prior version unioned every
step's `runsOn` here; that was a real bug, not just conservative — a project
with a macOS-only *local* gate and only Linux remote hosts would
config-error its entire remote build+test over a capability the remote
portion never used, #0521 review). Deliberately still not profile- or
changed-path-filtered even within build/tests, because host selection
happens once, up front, before any per-step filtering runs. A job whose
requirement no host provides **never** runs in the wrong place: it
fails immediately with `no remote host provides …` naming the configured
hosts, or waits (with the capability in its queue line) while a capable host is
busy. That failure is **non-retryable and never falls back locally** — it is a
configuration problem, so with `remoteValidation.fallbackToLocal = true` a
transient classification would otherwise silently run macOS-bound work on the
wrong machine; the gate reports it as `remote validation cannot run: …` and
points at this config instead. (An *unreachable* eligible host is different:
that stays transient and retryable.) The Hetzner runner is always one Linux VM
of a fixed, known type, so it implicitly satisfies a `"linux"` requirement
without needing to declare it — a Tailscale host does not get the same
free pass: its `os` reflects a real, arbitrary machine you configured, not
a guaranteed-Linux VM, so a `runsOn: ["linux"]` job only routes to a
Tailscale host that explicitly sets `os = "linux"` (#0521 review — this
asymmetry is intentional, not a bug: assuming an unlabeled Tailscale host is
Linux would be a guess this file can't verify). Today nothing declares
`runsOn` — native Swift/Xcode steps don't exist in the gate yet; keep them
local until they do.

#### Cross-process limit (the host lock)

The per-host cap above lives in one server process. A standalone `repoos check`
is another process, so the remote command itself is wrapped in a portable
`mkdir`-based slot lock on the host (`~/.repoos-validate-locks/<slot>`, under
the remote user's home like every other repoos scratch path — never
`/tmp`/`/var/tmp`, per the #0528/#0544 runner-scratch fixes — `hostLockShell`
in `src/server/remote-validation.ts`) with the same slot count:
server and CLI can never put more than the limit on one machine. That lock root
is deliberately **host-global, not per-repo** — the cap exists because of
machine load, so two different repos validated on the same host share its
slots (one machine = one suite, whoever asked for it). **Known limit:** this
only holds within one SSH user — living under `$HOME` means two different
SSH users on the same host get separate `$HOME`s and therefore separate lock
namespaces, so the shared cap doesn't actually span users (#0521 review). Not
fixed: a genuinely shared location (`/tmp`/`/var/tmp`) would restore it but
introduces a real permission problem instead (the sticky bit blocks one
user's stale-lock cleanup from removing another user's slot directory). Every
`just setup-<host>` recipe this repo ships only ever configures one SSH user
per host, so this is a documented limit for a multi-user host pool, not
something the maintained setup path can hit. A waiter
streams `[lock] waiting for a free slot …` while it waits and gives up after
its wait budget (the caller's deadline, else 15 min) with exit code 75, which
the runner reports as a transient "another repoos check is already running"
infra failure — never a red gate. While its suite runs, a holder **heartbeats**
its slot dir (a `touch` every minute), so a dir untouched for 10 minutes
provably belongs to a killed run and the next waiter breaks it — the stale
threshold sits deliberately *inside* the 15-minute wait budget so a waiter can
actually recover an orphan within one wait (the earlier 40-minute threshold
exceeded that budget and left waiters timing out with the misleading "another
repoos check is still running" message before the dir was breakable).

Each holder writes a `.meta` JSON file in its slot (`taskId`, gate `phase`,
optional `worktree`, `priority`). Waiters register under
`~/.repoos-validate-locks/wait/` with the same metadata. **Priority** lets
close-out and release beat engineer self-checks for the next free slot
(close-out = 100, release = 90, handoff pre-review = 60, managed-engineer
self-check = 30). The server's dispatch pool **samples** these locks over SSH
before choosing a host (`hostLockInspectShell`) and counts holders toward the
per-host cap, so a close-out is not sent to a host that standalone
`repoos check` runs already filled. The Checks → **Remote runners** tab lists
every holder and waiter (not only server-dispatched jobs), with phase, age,
and queue position; a failed "waited N s for a free host slot" message names
which jobs held the slot.

#### Deadlines

Waiting counts against the caller's own deadline: handoff passes its
10-minute finalization deadline (`deadlineAt`), close-out passes its pipeline
budget — `startedAt + closeOut.timeoutMs`, 6 minutes by default, `0` disables
it (#0573) — and a run still **queued** at that point cancels itself, releases
its slot and fails retryably with `… the caller's deadline passed, so the run
was cancelled and its slot released`. A run that reaches its host **after**
the deadline (its dispatch won the race with that cancellation timer, or the
deadline passed while it bundled and uploaded) cancels the same way instead of
starting.

The host lock is given the caller's deadline as an **absolute** timestamp
(`hostLockShell`'s `deadlineAtEpochSecs`), not just a relative wait budget
computed locally (`deadlineLockWaitSecs`, still passed too, for the
human-readable "waiting… (up to Ns)" message and as the sole budget when
there is no deadline at all). A purely relative budget is fixed before SSH
even connects; the remote script has no visibility into how long that
handshake took, so it could otherwise start well past the real deadline —
and a `0`-second budget alone did not stop it grabbing a slot that happened
to be free on the very first check (#0521 review). With the absolute
deadline, the remote script self-clocks against its own `date +%s`: it
refuses to even attempt the first acquisition once already past it, and its
wait loop checks the same absolute value on every 5-second poll instead of
counting elapsed sleeps from zero — both immune to however long it took to
get there. The Hetzner runner honours `deadlineAt` the same way on its own
in-process queue: a run still queued at the deadline is cancelled without ever
holding a slot, and provisioning that overruns it never starts a suite. A run
already executing is never interrupted mid-suite.

#### Hang detection and recovery (#0729)

A run can wedge without ever failing: on 2026-10-06/07 validation containers
hung with the host idle at load ≈ 0, the log looping `error: Module not found
"/repo/node_modules/vitest/dist/workers/forks.js"`. **Confirmed:** a startup
`rm -rf` of every `$HOME/.repoos-validate.*` workdir could delete a sibling
run's `/repo` mount before that container existed (#0729 review). **Unproven for
that outage:** shared `repoos-bun-cache` corruption from overlapping installs —
per-slot cache isolation below is preventive protection, not a re-litigation of
the incident. Nothing detected the hang automatically; a human did, 48 minutes
later.

The runner now watches each in-flight run. It samples the host's own 1-minute
load average (per CPU) on a timer, and every `hangCheckIntervalMs` (30 s) asks:
has this run's output been unchanged for `hangIdleMinutes` (default **5**) **and**
is the host idle (load per CPU below `0.5`)? Both must hold — a quiet run on a
**busy** host may simply be queued behind real work. When load probes fail, the
runner still recovers: output idle for `hangIdleMinutes` while load has been
unknown that long **and** the host was not busy the last time load was measured
(#0739) — unreachable stats must not hold a slot until the outer SSH timeout.
When both hold the runner removes **that run's** container by name (`docker rm -f
repoos-validate-<run-id>`, never a blanket `docker kill`), marks the summary
`hung` (transient, so the caller retries on another host, which the pool
excludes per #0632), records the outcome as `hung` in the check-run history
(never `fail` — there is no test result — and never `cancelled`, which is the
caller's own deadline), and lists the run under **Hung runs** on the host's row
in the Checks → Remote runners tab (`hungRuns` in the status payload) so the
kill is visible after the retry has moved elsewhere.

`validate.sh` names each container `repoos-validate-<unique-run-id>` (passed as
`REPOOS_CONTAINER`) so a hang kills exactly one run, and sweeps
`repoos-validate-`-prefixed leftovers at probe time and at the start of a run —
a `docker run --rm` killed by a dropped SSH link or a rebooted host otherwise
leaves its container behind. The engineer sets a unique id from the run's
artifacts path; a standalone `validate.sh` run falls back to a pid-based name.
Killing a hung run is also a CTO safe action (`kill-hung-validation`, task
scoped, rate limited, audited — #0688): the watchdog's automatic kill is the
normal path, and the CTO re-issues it if that kill could not land.

#### Per-slot cache isolation (#0729)

On Docker hosts the bun cache is a named volume. It used to be the single
`repoos-bun-cache` for every run on the host, so two runs that overlap (a host
with `maxConcurrent > 1`, or the host lock's slots) could write the same cache
directory and observe each other's partial installs — a **plausible** failure
mode that was never confirmed as the 2026-10-06/07 root cause (workdir deletion
was). The volume is now keyed to the host-lock **slot** the run holds: slot 0
keeps the original `repoos-bun-cache` name (so a host's existing warm cache is
reused by the first run), and every other slot gets `repoos-bun-cache-slot<N>`.
The host-lock wrapper exports the acquired slot index as `REPOOS_SLOT`, and
`validate.sh` appends it to the base volume (`REPOOS_CACHE_VOLUME`), so runs
that may overlap never share a cache dir. `cacheVolumeForSlot` in
`src/server/remote-validation.ts` is the one place that names the volume.

#### Concurrency

Runs are limited per host by `remoteValidation.maxConcurrent` (default **1**,
Settings → Remote validation) with optional per-host overrides. The limit is a
FIFO queue inside the server's single runner instance, so **every server-side
caller shares it** — engineer handoff, close-out and release — and the host
lock extends it across processes (above). Why one by default: two full suites
on one machine cause load-induced timeouts and timing-sensitive test failures,
and a remote failure is reported as a red gate ("fix it in the branch"), so
contention would blame a branch that is fine. Raise it only for a host with
headroom.

Each run also gets its **own bundle and artifacts path** on the host
(`~/.repoos-<task>-<id>.bundle`, `~/.repoos-artifacts/<task>-<id>/`, passed to
`validate.sh` as its third argument) so overlapping runs never delete each
other's logs; artifact dirs older than a day are pruned. Across runs, the same
host keeps a **persistent bare mirror** under `~/.repoos-cache/` (one directory
per repo root, hashed so two projects never collide) so later uploads can be
incremental; clearing that directory forces the next run back to a full bundle. This lives under the
remote user's home directory deliberately, not `/tmp` or `/var/tmp`: on
Linux, `/tmp` is commonly a RAM-backed tmpfs with a per-user quota shared
with whatever else that user runs on the box (e.g. a desktop session on a
runner that's also someone's daily machine), so a run can hit "disk quota
exceeded" for reasons unrelated to the task — but on a macOS host running
Docker Desktop, `/var/tmp` (and `/tmp`) are *not* shared into containers by
its bind-mount file sharing by default, only paths under `$HOME` are, so a
WORK dir there mounts as an empty directory inside the container ("bun could
not find a package.json"). `$HOME` is real disk everywhere and satisfies
Docker Desktop's default share list, so it's the only location safe on both.
The scripts on the host are copies: after updating RepoOS run
`just setup-<host>` again, otherwise an old `validate.sh` ignores the third
argument, keeps using its own shared default artifacts dir, and the per-run
log download finds nothing (the verdict is unaffected).

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

Abstract job/provider model (beyond the tailscale host pool), per-task
autoscaling, Hetzner VM pooling (out of scope for #0521 by design), and live
log streaming into the browser SSE feed (today logs are a file + the failure
tail, matching how the pipeline surfaces gate output).
