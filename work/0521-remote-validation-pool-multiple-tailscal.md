---
updated_at: "2026-09-27T18:43:20Z"
review_passes: 11
id: "0521"
title: "Remote validation: pool multiple tailscale hosts"
type: feature
status: review
priority: p3
area: core
assigned_to: ai
created_by: ""
branch: feat/remote-validation-pool-multiple-tailscal
cli_override: opencode
model_override: opencode-go/mimo-v2.6-flash
review_cli_override: codex
review_model_override: gpt-6-sol
created_at: "2026-09-26T11:49:01Z"
review_rounds: 2
dev_error_count: 2
---
## Problem

`[remoteValidation]` supports a single tailnet host (`tailscaleHost`). With #0520
the pre-review gate, every MTD close-out and releases all run on that one machine,
and the owner has several tested tailscale servers (Linux and macOS) that go
unused. RepoOS also has no way to send work to a host of the right OS: a mac and
a Linux host can each be set up on their own (`validate-macos.sh` vs the Docker
`validate.sh`), but only one can be configured at a time.

## Depends on #0520 (already provides)

Do not redo these; this task builds on them:

- **FIFO concurrency limit** in the runner (`ConcurrencyGate`,
  `remoteValidation.maxConcurrent`, default 1). It is per runner instance, i.e.
  per **server process** and per host today.
- **Per-run isolation**: unique bundle path and artifacts dir per run, passed to
  `validate.sh` as its third argument.
- **Standalone `repoos check` uses the remote gate only with the Tailscale
  provider**; Hetzner's single warm VM stays server-owned.
- Known limits it left open (in scope here): a standalone CLI run is a separate
  process, so it is **not** counted against the server's limit; the handoff has
  a 10-minute deadline that a queue wait can exceed, and the orphaned run keeps
  its slot (no cancellation).

## Changes

1. **Host list.** Allow several hosts (e.g. `tailscaleHosts`, each with optional
   `user`, `os`, `labels`, `maxConcurrent`), keeping `tailscaleHost` as the
   single-host shorthand so existing configs keep working. Verify the parser
   still reads the current `repoos.toml`. Tailscale only; Hetzner stays a single
   VM.
2. **Dispatch.** Send each job to an idle host that satisfies its requirements;
   queue only when every eligible host is at its limit (the per-host limit is
   the existing gate). Track per-host in-flight state and health (an unreachable
   host is skipped and retried later), and record which host ran each job in its
   log and in the status endpoint.
3. **OS / label routing.** A job can require a host capability, so work that
   needs macOS runs on a macOS host. Decide the mechanism: a `runsOn`/`requires`
   on `[[check.steps]]` (the plan already has `requires` for tools), or routing
   by changed paths (`macos/**`). Note the gate does **not** build or test
   Swift/Xcode code at all today (only the local `macos-hub-icon-transparency`
   step), so native-build steps must exist before routing has anything to
   route; keep them local until this lands.
4. **Cross-process limit.** Make a standalone `repoos check` respect the same
   per-host limit (a host-side lock in `validate.sh`, or handing the run to the
   server), so the CLI and the server cannot put two full suites on one host.
5. **Deadline and cancellation.** A queued run must not outlive the deadline of
   the caller that gave up on it: cancel it, or release its slot.
6. **Per-host prerequisite check** (Docker/`repoos-ci` image or the macOS
   toolchain, bun cache, an up-to-date `validate.sh` that accepts the artifacts
   argument) so a misconfigured host is reported instead of failing jobs.
7. **Settings UI and status endpoint** (`/api/remote-validation/status`) showing
   each host's state, per the AGENTS.md Settings-UI rule.

## Acceptance

- Test: two concurrent jobs run on two hosts; a third queues.
- Test: an unreachable host is skipped and jobs land on the others.
- Test: a single `tailscaleHost` config still works unchanged.
- Test: a job that requires `macos` is never dispatched to a Linux host, and
  waits (with a clear log line) or fails clearly when no macOS host is eligible.
- Test: a standalone CLI run and a server run on the same host respect one limit.
- `docs/remote-validation.md` updated (hosts, routing, per-host install).

## Out of scope

Autoscaling, and pooling Hetzner VMs.

## Activity

- 2026-09-26T11:49:01Z · created · unknown
- 2026-09-26T13:05:31Z · status inbox→ready
- 2026-09-27T02:46:03Z · body
- 2026-09-27T03:10:47Z · cli_override
- 2026-09-27T03:11:01Z · model_override
- 2026-09-27T03:11:03Z · status ready→active, branch
- 2026-09-27T04:25:07Z · status active→review
- 2026-09-27T04:33:08Z · status review→active
- 2026-09-27T04:53:25Z · status active→review
- 2026-09-27T05:01:42Z · watchdog: auto-retried dead reviewer session · the reviewer agent produced no report and its session ended — starting a fresh review
- 2026-09-27T05:11:44Z · status review→active
- 2026-09-27T05:24:34Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-09-27T05:30:41Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-09-27T05:34:36Z · status active→review
- 2026-09-27T05:34:37Z · status review→active
- 2026-09-27T05:37:03Z · status active→review
- 2026-09-27T06:53:17Z · needs_input dismissed by hello@repoos.org
- 2026-09-27T06:55:03Z · status review→active
- 2026-09-27T07:19:51Z · status active→review
- 2026-09-27T07:27:24Z · watchdog: auto-retried dead reviewer session · the reviewer agent produced no report and its session ended — starting a fresh review
- 2026-09-27T07:34:43Z · needs_input
- 2026-09-27T10:21:24Z · needs_input dismissed by hello@repoos.org
- 2026-09-27T10:21:26Z · needs_input
- 2026-09-27T10:22:59Z · status review→active
- 2026-09-27T10:23:00Z · needs_input
- 2026-09-27T11:05:38Z · status active→review
- 2026-09-27T11:13:34Z · needs_input
- 2026-09-27T13:20:26Z · needs_input
- 2026-09-27T13:20:26Z · needs_input
- 2026-09-27T14:42:04Z · review_cli_override, review_model_override
- 2026-09-27T14:42:06Z · review_model_override
- 2026-09-27T14:44:00Z · needs_input
- 2026-09-27T14:44:00Z · needs_input
- 2026-09-27T15:10:05Z · needs_input
- 2026-09-27T15:10:06Z · needs_input
- 2026-09-27T15:58:51Z · needs_input dismissed by hello@repoos.org
- 2026-09-27T16:08:07Z · needs_input
- 2026-09-27T16:31:25Z · needs_input
- 2026-09-27T16:31:25Z · needs_input
- 2026-09-27T18:43:20Z · needs_input

