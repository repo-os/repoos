---
status: proposed
date: 2026-10-22
---

# 0009 — Run engineer sessions on remote runners with bundle-in / bundle-out sync

## Status

Proposed; pending human acceptance before any implementation starts (#0904).

## Context

Remote runners already execute the expensive, bounded parts of a task:
pre-review and close-out gates (`src/server/remote-validation.ts`,
`src/server/pre-review-remote-gate.ts`), browser evidence
(`src/server/shot-capture.ts`, `scripts/remote-runner/capture-browser.ts`,
#0854/#0874), and health-aware
placement with a per-host pool and memory-pressure probe (#0901). The engineer
and reviewer processes themselves still start on the laptop.

That is now the throughput limit on this repo's dogfooding machine: a fanless
MacBook Air under constant compressor pressure (35–38% of RAM on 2026-10-21),
running up to three engineers plus gates and headless browsers at once. The
local pressure guard holds new starts, test workers get killed under swap
pressure, and remote gates fall back to the laptop when the laptop is the
problem — the exact resource the runner pool was meant to remove from the
critical path.

What exists today that this decision builds on:

| Piece | Where | What it gives us |
| --- | --- | --- |
| SSH transport + hard deadlines | `src/server/remote-validation.ts` (`execRemoteWithHardDeadline`) | bounded reachability, no wedged SSH holding a slot |
| Incremental bundle upload | `prepareCandidateUpload` / `validate.sh` mirror (#0717) | kilobytes per run once a host holds the base |
| Host pool | `TailscaleHostPool` | per-host caps, LRU tie-break, health probe, queue visibility (#0897) |
| Runner health | `#0901` pressure probe | skip a pressured host, never blame the branch |
| Agent lifecycle | `AgentRunner` (`src/server/agents.ts`) | spawn, stream, parse per CLI, reload re-attach (#0288), phantom heal (#0863) |
| Runner image | `scripts/remote-runner/Dockerfile.ci` | Bun, git, Node, Playwright WebKit |

The engineer session is a different workload from a gate. It is long-lived
(hours, not minutes), interactive (Send/Pause/Resume), may receive a follow-up
turn after the process exits, and its transcript is the primary thing the human
watches. A gate is a one-shot command that must run to completion or fail
cleanly.

## Decision

### 1. Execution model: a real git worktree on the runner, never a network mount

Run the engineer in an isolated checkout on the chosen runner and synchronise
commits with git bundles in both directions. Do **not** mount the laptop's
worktree over sshfs/SFTP/NFS.

- **Inbound:** the existing incremental bundle path seeds the runner's
  per-repo bare mirror at the task branch tip. A linked worktree is created
  from that mirror:
  `git -C <mirror> worktree add -B <branch> ~/.repoos-engineers/<repo>/<task> <sha>`.
  The worktree lives outside the control plane's tree, under the runner user's
  home (the same place `validate.sh` already keeps its work tree and mirror).
- **Outbound:** after each engineer turn, and again immediately before a
  handoff, the runner writes a bundle of the branch tip
  (`git bundle create - <branch> --not <base>` when the local side has the
  base, otherwise the full branch ref). RepoOS fetches it into the local task
  branch and records the fetched sha.
- **Why not a mount:** `bun install`, git index locks, atomic renames and
  Playwright's temp files all assume a local filesystem. A tailnet drop under a
  mounted checkout looks like file corruption and half-written state, which is
  the failure mode this design has to make legible, not amplify. A bundle
  transfer either applies atomically or fails with a git error; it cannot leave
  the tree in a partially written state.
- **Local worktree stays canonical.** The task branch, task file, review lock
  and handoff gate all still read the local worktree. The remote worktree is an
  execution sandbox whose commits are landed into the local branch before
  handoff. The local worktree is only fast-forwarded (not silently reset) when
  it is clean and its HEAD is an ancestor of the fetched tip; otherwise the
  sync stops with an explicit "remote tip and local tree diverged" recovery
  step. A remote run is only started from a clean local worktree, so this is
  the exceptional case, not the normal path.
- **A dirty remote worktree is never discarded.** If the engineer exits with
  uncommitted changes, RepoOS records them as a durable WIP checkpoint commit
  on the remote branch (`repoos: remote WIP checkpoint`) and fetches that,
  matching the local WIP-checkpoint behavior the managed engineer already gets
  for self-checks (#0512/#0836). If the checkpoint cannot be made (read-only
  tree, missing identity), the task is surfaced with `needs_input` naming the
  remote path and the exact command, and the local branch is left untouched.

### 2. Runner-side supervisor: the SSH stream is a view, not the process lifetime

The engineer process is not owned by the ssh client. Each remote turn starts a
small supervisor on the runner (installed next to `validate.sh` as
`/opt/repoos/run-engineer.sh`) which:

1. writes `meta.json` (task, branch, run id, CLI, worktree, started-at);
2. runs the CLI with output to `events.jsonl` (stdout/stderr, unstyled bytes)
   and a bounded tail for the UI;
3. updates `heartbeat` (mtime + monotonic tick) at a fixed interval even when
   the agent is silent, so "thinking" is distinguishable from "gone";
4. writes `exit.json` with the real exit code/signal when the CLI ends;
5. keeps its own pid/pgid, so a reboot or `kill -9` is observable.

The control plane's ssh client tails `events.jsonl` from a recorded offset and
forwards lines into the existing `AgentRunner` parser pipeline. A dropped SSH
connection therefore does **not** end the turn:

| Observation | Meaning | Action |
| --- | --- | --- |
| `exit.json` present | the CLI ended; code is real | normal turn completion (success or crash by code) |
| no `exit.json`, heartbeat fresh, pgid alive | still working; stream is down | `connection-lost`, keep the task running, reconnect and resume from the offset |
| no `exit.json`, pgid gone, heartbeat stale | process died (OOM, reboot, kill) | crashed agent: record the last line and use the existing crash/failover path (#0869) |
| host unreachable | unknown, not crashed | `connection-lost · unreachable`, keep the remote lease, retry on a timer; never start a second engineer for the same task |

A reconnect resumes the transcript at the last consumed offset, so output is
neither duplicated nor dropped. The heartbeat is independent of agent output,
which is what lets a long silent turn stay "running" rather than tripping the
local stall detector.

### 3. Reuse `AgentRunner` as the state machine; remote is a transport

`AgentRunner` keeps ownership of the task transcript, per-CLI parsers, signals
(`::repoos-handoff-ready::`, preview requests), queued messages, session ids,
usage folding, and stop/pause semantics. Remote execution is added as a
transport with the same observable contract:

- `start` / `send` prepare the remote worktree, launch the supervisor, and
  return the same `StartResult`;
- `stop` signals the supervisor's process group and waits for its exit marker;
- `pause` is a stop plus a durable "paused" marker, unchanged;
- `output` reads the same transcript, filled from the remote event file;
- `isRunning` consults the remote supervisor state plus the existing live
  registry, not just a local `ChildProcess`.

Turns after the first (`send`, queued-message delivery, crash recovery) resume
the same remote worktree and the same CLI session id. A CLI change between
turns drops the session id exactly as it does locally.

### 4. Placement is health-aware and local-first

New `[remoteEngineers]` config (Settings → Remote validation → **Engineer
sessions**):

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | Feature switch; off means local, with no new code path in use |
| `placement` | `local-first` | `local-first` (local unless the task explicitly asks for a runner), `runner-first` (least-loaded healthy runner, local fallback), `runner-only` (queue/refuse if no runner) |
| `maxPerHost` | `1` | Concurrent engineer sessions per runner; a per-host `maxEngineers` row overrides it |
| `heartbeatTimeoutSeconds` | `90` | Silence after which an unverifiable remote run is investigated (not immediately failed) |
| `recoverOnBoot` | `true` | Re-attach live sessions after a control-plane reload (#0288) |
| `fallbackToLocal` | `true` | Start locally when the chosen runner is unreachable at start; a visible note names the host |

Placement reuses the pool's #0901 probe: an unreachable or pressured host is
skipped, and if every eligible host is pressured the start queues with the
same human fix text the validation queue shows. The engineer cap is separate
from the validation cap so a gate cannot starve engineers on a small runner,
but both are enforced by the same per-host host-lock so two server processes
cannot oversubscribe one machine. The selected host, its health, and the
queue reason appear on the task drawer and the Runners tab.

### 5. Reload durability (#0288) and phantom healing (#0863)

- **Durable registry.** The existing registry entry gains
  `execution: "local" | "remote"` and, for remote, `{host, workdir, runId,
  eventOffset, lastHeartbeatAt}`. It is written before the launch returns, so a
  reload in the spawn window cannot lose the run.
- **On boot**, a remote entry is adopted: the server reconnects, tails from
  `eventOffset`, and keeps the entry. It is not converted to a phantom merely
  because no local `ChildProcess` exists — that would duplicate engineers after
  every reload.
- **Phantom healing** extends the existing rule with the table above: a remote
  entry is phantom only when the supervisor is provably gone (stale heartbeat
  and no live pgid) and the host is reachable. The existing per-task hourly
  heal budget and the `restart` / `rate-limited` / `cleared-for-start` hooks
  apply unchanged. An unreachable host is `connection-lost`, never a phantom
  restart — restarting a possibly live remote engineer is the one outcome that
  must not happen automatically.
- **Stop semantics** stay explicit: a pause/stop writes a stop request the
  supervisor polls, and only a confirmed exit clears the registry entry.

### 6. Handoff and close-out keep their current invariants

- The branch tip is fetched back **before** handoff computes the review lock
  sha, so `lock sha == worktree HEAD` still holds. A failed fetch makes the
  handoff retryable and leaves the task `active`; it never computes a lock from
  a stale local branch.
- The handoff/close-out gate runs on the same host first (the worktree and
  mirror are warm there). If that host has become unhealthy, the existing
  `retryOtherHosts` path runs the gate on another healthy host; only committed
  work is bundled, as today.
- Review is unchanged: it reads the fetched local branch and its diff. The
  reviewer may run locally or remotely as its own role configuration, but this
  ADR does not require reviewer offload.

### 7. CLI authentication lives on the runner, never in repoos.toml

RepoOS never receives, stores or transmits engineer credentials. The control
plane sends a credential **profile name** at most; the value stays on the
runner.

Two supported shapes, chosen per runner:

1. **Native runner (`runner = "native"`)**: the engineer CLI is installed and
   logged in once as the runner user. Its existing config directory
   (`~/.config/opencode`, `~/.codex`, `~/.claude`, `~/.cursor`, …) is the
   credential source. No copy or mount is needed.
2. **Docker runner (`runner = "docker"`, the default)**: the same directories
   are bind-mounted **read-only** into the engineer container at the same
   `HOME`-relative path, and the container's `HOME` is a per-run writable
   directory so a CLI can write its own session/cache files without mutating
   the credential mount. For API-key CLIs, a runner-owned 0600 env file
   (`~/.config/repoos/engineer.env`) is sourced by `run-engineer.sh`; the file
   is never uploaded, logged or echoed.

A setup checklist for the human task (#0907) is in
`docs/remote-validation.md` → "Engineer sessions setup checklist". It covers
installing each CLI, logging in or placing keys, proving a non-interactive
`--version`/smoke run, file permissions, and which CLIs each runner can run.
Nothing in `repoos.toml`, `work/*.md`, a task transcript, chat, or a bundle
contains a key.

### 8. Failure model and recovery paths

| Injected failure | Detected by | Task state | Recovery |
| --- | --- | --- | --- |
| runner unreachable at start | SSH probe before worktree creation | `active`, start refused/moved | auto-fallback local when `fallbackToLocal`, otherwise a retryable start failure naming the host and the Tailscale fix |
| connection drops mid-run | ssh exit + no `exit.json`; heartbeat/pgid still alive | still running (`connection-lost`) | reconnect and resume at offset; the agent is not killed or duplicated |
| runner reboots | heartbeat stale + pgid gone after reconnect | crashed (`remote-crashed`) | fetch the last checkpoint, resume the same branch on the same or another healthy host |
| dirty remote worktree | exit with `git status --porcelain` non-empty | WIP checkpoint committed, or `needs_input` naming the path | commit is fetched and reviewable; otherwise a human/agent resolves it on the named host |
| remote tip and local tree diverged | fetch-back fast-forward check | `needs_input` (`remote-diverged`) | explicit merge/abort choice; nothing is force-reset automatically |
| control-plane reload | durable registry on boot | re-attached | tail from offset, no restart |
| supervisor killed but host alive | heartbeat stale + no exit marker | crashed | existing crash-resume path on a fresh remote worktree |

## Consequences

- The laptop keeps the board, task files, review, and the canonical branch; it
  stops being the compute host for long engineer turns.
- A remote engineer needs the repo's dependency install once per worktree
  (cached by the runner's bun cache) and a bundle round trip per turn; both are
  already exercised by validation and browser capture.
- The contract is more complex than a local spawn: a supervisor, heartbeat,
  offset tracking, and a fetch-back step. That complexity is confined to one
  transport module so `AgentRunner`'s parsers and handoff rules stay shared.
- A remote worktree cannot rely on a laptop-local path (an absolute path in a
  prompt, an editor socket, a local preview port). The mission prompt and the
  AGENTS.md worktree rule must state the remote path explicitly.
- Credentials are a runner-operator responsibility. Until #0907 is done, the
  feature is proven with fake runners/CLIs only and is off by default.

## Alternatives considered

- **sshfs / mounted checkout.** Rejected: network filesystem semantics under
  `bun install`, git lock files, atomic renames and Playwright temp files;
  a dropped tailnet connection becomes ambiguous filesystem state rather than
  a clean transport error.
- **Run the CLI on the runner and stream only stdout, no worktree.** Rejected:
  the agent needs to build, test and commit in a real checkout, and `repoos
  check`/handoff must see the same tree.
- **Push every commit to a Git remote (GitHub or a bare repo) instead of
  bundles.** Rejected as the required path: RepoOS is explicitly usable with no
  remote, and a bundle keeps the transport self-contained and authenticated by
  the same SSH key. A bare ref on the runner is allowed as an internal cache,
  not as a user-visible remote.
- **Keep the ssh client as the process owner.** Rejected: a dropped connection
  would look like a crashed agent and either duplicate work or lose the turn.
- **Central credential store on the control plane.** Rejected by
  `docs/api-keys.md` and the task's explicit no-secrets-in-config rule; it also
  puts a laptop compromise in the path of every runner.

## Follow-up work (file after this ADR is accepted)

This ADR deliberately does not build. The acceptance criteria in #0904 split
into these independent tasks, in order:

1. **Config, Settings and placement** — `[remoteEngineers]` keys, per-host
   `maxEngineers`, `getConfigSchema()`/supported-keys/docs entries, Settings
   controls, health-aware selection and the per-host engineer cap.
2. **Runner supervisor and worktree protocol** — `run-engineer.sh`, mirror +
   linked worktree create/reuse, event/heartbeat/exit files, bundle-out, WIP
   checkpoint, clean/dirty/diverged classification.
3. **AgentRunner remote transport** — start/send/stop/pause/output/resume over
   the supervisor, transcript offsets, durable registry fields, reload adopt,
   remote-aware phantom classification.
4. **Fetch-back and handoff integration** — branch tip fetched before lock sha,
   local worktree fast-forward policy, gate host selection, retryable handoff on
   fetch failure.
5. **Failure-injection suite** — unreachable start, mid-run disconnect, reboot,
   dirty worktree, diverged local tree, reload during a turn; each proves the
   table in §8 with fake runners and fake CLIs.
6. **Docs and setup checklist** — user-docs page, `docs/remote-validation.md`
   update (this ADR's checklist), AGENTS.md remote-worktree rule; the human
   auth/verification task stays #0907.

Until #0907 lands, the feature remains off by default and no real engineer run
happens on a runner.

## References

- `docs/remote-validation.md` — transport, pool, health probe, bundle upload.
- `src/server/agents.ts` — `AgentRunner`, durable registry, phantom healing.
- `docs/agent-run-operations.md` — crash resume (#0869) and stuck-task rules.
- `docs/api-keys.md` — the no-secrets contract.
- `docs/close-out-pipeline.md` — lock sha and handoff invariants.
- #0288 (reload durability), #0512 (committed work), #0717 (incremental
  bundles), #0863 (phantom healing), #0901 (health-aware dispatch), #0907
  (human auth/verification).
