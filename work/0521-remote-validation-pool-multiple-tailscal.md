---
updated_at: "2026-09-27T22:45:37Z"
review_passes: 14
id: "0521"
title: "Remote validation: pool multiple tailscale hosts"
type: feature
status: review
priority: p3
area: core
assigned_to: ai
created_by: ""
branch: feat/remote-validation-pool-multiple-tailscal
model_override: cursor-grok-4.6-medium
review_cli_override: github copilot
review_model_override: default
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
- 2026-09-27T17:43:47Z · needs_input
- 2026-09-27T17:43:47Z · needs_input
- 2026-09-27T18:22:58Z · review_cli_override, review_model_override
- 2026-09-27T18:23:27Z · review_cli_override, review_model_override
- 2026-09-27T18:23:29Z · review_model_override
- 2026-09-27T18:24:20Z · needs_input dismissed by hello@repoos.org
- 2026-09-27T18:25:47Z · exhausted-review flag left cleared: dismissed during this review
- 2026-09-27T19:09:24Z · needs_input
- 2026-09-27T19:10:07Z · cli_override, model_override
- 2026-09-27T19:10:09Z · model_override
- 2026-09-27T19:10:19Z · review_cli_override, review_model_override
- 2026-09-27T19:10:22Z · review_cli_override, review_model_override
- 2026-09-27T19:10:23Z · review_cli_override, review_model_override
- 2026-09-27T19:10:31Z · status review→active
- 2026-09-27T19:10:31Z · needs_input
- 2026-09-27T22:32:42Z · watchdog: auto-surfaced stuck task · status active→review · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-09-27T22:32:43Z · status review→active
- 2026-09-27T22:35:27Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/system-resources.test.ts:88:43
     86|       // availableMem counts reclaimable memory (free + inactive + cac…
     87|       // is always >= raw freeMem and never exceeds total.
     88|       expect(result.machine.availableMem).toBeGreaterThanOrEqual(resul…
       |                                           ^
     89|       expect(result.machine.availableMem).toBeLessThanOrEqual(result.m…
     90|       expect(result.serverPid).toBe(process.pid);
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 272 passed (273)
      Tests  1 failed | 3191 passed | 12 skipped (3204)
   Start at  22:33:08
   Duration  135.80s (transform 3.73s, setup 1.15s, import 16.31s, tests 124.11s, environment 117.47s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 257ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  22:35:24
   Duration  1.38s (transform 574ms, setup 8ms, import 669ms, tests 257ms, environment 387ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-09-27T22:40:42Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/system-resources.test.ts:88:43 · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-09-27T22:40:43Z · status review→active
- 2026-09-27T22:43:31Z · status active→review

