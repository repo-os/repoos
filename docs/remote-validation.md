# Remote Validation Runner

Written 2026-08-28. Updated 2026-09-22 to add the Tailscale provider, and
2026-09-27 to pool multiple Tailscale hosts (#0521).
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
`repoos check` runs the remote half first unless you pass `--local-tests`, use
`--changed` / `REPOOS_CHECK_CHANGED` (fast local pre-review only), or either env
var is already set. The remote bundle is **`git bundle create … HEAD`**, so only
committed work reaches the runner, and local tests are skipped after a green
remote pass. What is tested must be what is committed (#0512), which the two
entry points guarantee differently:

- **Handoff** commits the worktree first (the commit gate runs before the check),
  so the sha the runner tests already contains everything the agent wrote.
- **Standalone `repoos check`** uses the remote gate only with the **Tailscale**
  provider. Hetzner's single warm VM is owned by the server process (its state
  lives in the server's `.repoos/remote-runner.json`); a CLI in a task worktree
  has a different root, so its leak reconciliation would delete the server's VM
  mid-run. With Hetzner the CLI runs the full local gate and says so; handoff and
  close-out still use the runner.
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

### Retry on other hosts (`retryOtherHosts`)

When `remoteValidation.retryOtherHosts` is `true` (default when 2+ `tailscaleHosts` are configured), a transient failure (`timeout`, `Killed`, `Broken pipe`, host unreachable mid-run) on host A retries the full run on the next healthy, free host that was not already tried this run — tracked per-run by host name. Only after every eligible host has failed does the existing `fallbackToLocal` / retryable behaviour apply. A non-transient failure (`ok: false`, `transient: false` — a real red gate or `configError`) never retries; it is the branch's fault, not infra. A host is never retried twice within one run (`triedHosts` set), and the caller's `deadlineAt` is respected across all attempts: a queued retry cancels itself the same way as the first attempt.

In the run log and structured events, each attempt records which host ran it (`[runner user@host]`), the exit code, and whether it was `infra` — so a retry history is fully visible in the task's Debug tab (`GET /api/tasks/:id/remote-validation/events`) without opening the raw log.

Set it in `repoos.toml` (`remoteValidation.retryOtherHosts`), in Settings → Remote validation (switch under the provider tabs), or via the CLI (`repoos update <id> --body` never edits it — the Settings form is the UI path).

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

#### Dispatch, health and queueing (#0521)

Each job goes to an **idle host that satisfies its requirements**; it queues
only when *every* eligible host is at its per-host limit, in FIFO order, and a
macOS-only waiter never blocks a Linux job. Limits are per host
(`maxConcurrent` per host → `remoteValidation.maxConcurrent` → 1), so two jobs
run on two hosts while a third waits. A run that has to wait logs
`[queued behind N other remote run(s) …]` in its remote-validation log and in
the caller's output, and the log records which host ran each job
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

Before a host's first job it is probed over SSH: reachability, the toolchain
its `runner` says to expect — Docker, the configured `containerImage`
actually present (not just the daemon reachable — a daemon up with the
image never built/pulled used to report healthy, then fail every job it
got, #0521 review), or bun/git for a native host — see "Docker vs. native"
above — **the bun cache is actually writable by whoever will write to it**
(native: a plain host-path write-then-remove, since bun runs as the SSH
user directly; Docker: the exact sequence `validate.sh` runs against the
named `repoos-bun-cache` volume — chown it to the container's uid as root,
then write as that uid — proved live against a real macOS/Colima host
rather than approximated, after two earlier, narrower versions of this
check both turned out insufficient in successive review rounds: first it
tested only the SSH user's own — trivially true — access to a *host
directory*; second it added a host-side `chmod`, which is invisible to the
container on macOS/Colima, whose bind-mount view maps a host directory to
root:root 0755 inside the VM regardless of the real host-side permissions.
A named volume sidesteps that host-filesystem-mapping problem entirely) —
and an **up-to-date `validate.sh` that accepts the artifacts dir as
its third argument**. A host that fails is reported instead
of failing jobs — its state and reason show in Settings → Remote validation
(Hosts) and in `GET /api/remote-validation/status` (`hosts[]` with `probed`,
`healthy`, `detail`, `inFlight`, `queued` — each waiting run counted against the
one host it would run on next, so the column totals sum to the real queue
length — `lastRun` with the run's duration, and #0564's `activeRuns`
(task id + start time of each in-flight run) plus `queuedTasks`, the FIFO
next-up task ids attributed to that host). The Checks page's **Remote runners**
tab renders the same payload live, including a per-host **Server stats** row
with load averages, CPU count, memory use/total, free space on the remote
user's home work area, and sample time. While that tab is open, it requests
read-only SSH samples every 15 seconds with a five-second timeout; samples do
not acquire a run slot or wait behind validation jobs. Unsupported commands,
failed SSH, and unreachable hosts show unavailable values rather than blocking
the status page. Host state is in-memory per server process;
the durable record of what actually ran lives in the check-run history
(`.repoos/checks.db`, below) — it is skipped while
other hosts are healthy, and re-probed later (30 s cooldown, capped at 10
retries) so it rejoins the pool when it comes back. Once a host hits that cap
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
other's logs; artifact dirs older than a day are pruned. This lives under the
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
