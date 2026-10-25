---
id: "0958"
title: "Bug: RepoOS re-enables git fsmonitor on every server start (one daemon per worktree, load spikes); respect a human's false and add an off switch"
type: bug
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "engineer keeps crashing (3 in 30m): a human-set task override (codex + gpt-6-luna) is pinned, so RepoOS did not replace it. Review the crash detail and either fix the environment, change the override, or resume manually."
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/bug-repoos-re-enables-git-fsmonitor-on-e
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-25T11:34:02Z"
updated_at: "2026-10-25T13:40:29Z"
dev_error_count: 3
engineer_crash_log: "[{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-10-25T12:28:50.937Z\",\"kind\":\"dev-error\"},{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-10-25T12:29:40.632Z\",\"kind\":\"dev-error\"},{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-10-25T12:30:06.686Z\",\"kind\":\"dev-error\"}]"
---
## Problem

At every server start, `tuneRepoForScale(config.root)` (`src/core/git.ts`, called from `src/server/server.ts`) writes `core.fsmonitor = true` and `core.untrackedCache = true` into the repo's `.git/config`, and it re-writes them whenever the value is not exactly "true". Linked worktrees share that config, so a repo with 25 task worktrees runs about 25 `git fsmonitor--daemon` processes (31 counted), each registering FSEvents watches on a tree that includes `node_modules`. On Nick's Mac this drove `fseventsd` to 100%+ CPU and over 1 GB of memory, machine load into the hundreds, and server freezes. A human who sets `core.fsmonitor=false` to stop it has the setting silently reverted on the next server start (every managed project runs its own RepoOS server: repoos, divot, lightingai, pn, squishy).

## Desired behavior

1. `tuneRepoForScale` never overrides a value a human set: if the key is already set to anything (true or false), leave it. Only set the keys when they are unset.
2. Provide an explicit off switch: a `repoos.toml` setting (for example `git.tuneForScale = false`) with a Settings UI control and copy that explains the tradeoff, honored by the server start path. Default decision to document in the notes: leave the default on only if the daemon count is bounded; consider defaulting off on macOS, or enabling fsmonitor only for the main checkout and not task worktrees.
3. Bound the cost when it is on: do not leave one daemon running per finished task worktree; stop the daemon (`git fsmonitor--daemon stop`) when a worktree is removed or its task is done, and at close-out cleanup.
4. `repoos doctor` warns when more than a threshold of fsmonitor daemons run (for example more than 8), names the cost, and shows the one-line fix.

## Acceptance criteria

- [ ] Test: a repo with `core.fsmonitor=false` is left false after `tuneRepoForScale`; an unset repo gets true only if the setting allows it.
- [ ] The new setting appears in `getConfigSchema()` and the Settings UI with a test, and is documented in `user-docs/configuration.md`.
- [ ] Worktree removal/cleanup stops that worktree's fsmonitor daemon (test with a fake git runner).
- [ ] `repoos doctor` reports the daemon count and warns above the threshold (test).
- [ ] Docs: note the fsmonitor cost and the Nick incident (2026-10-25) in `docs/` where appropriate.
- [ ] Run tests touching git.ts and server start in small groups, then `repoos check --changed main`.

## Notes for AI

- Do not start a second RepoOS server from a worktree (bug #0954).
- Nick has already set core.fsmonitor=false and core.untrackedCache=false by hand in repoos, divot, lightingai, pn and squishy; the fix must not undo that.

## Activity

- 2026-10-25T11:34:02Z · created · njachowski@gmail.com
- 2026-10-25T11:35:12Z · status inbox→ready
- 2026-10-25T11:35:27Z · cli_override, model_override
- 2026-10-25T11:35:28Z · status ready→active, branch
- 2026-10-25T12:11:21Z · watchdog: auto-surfaced stuck task · status active→review · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-10-25T12:11:22Z · note: handoff requested (cli)
- 2026-10-25T12:23:00Z · CTO action: restart-stalled-agent (resume) · agent never started — no session exists for this task
- 2026-10-25T12:28:50Z · agent exited with an error (codex) · 2026-10-25T12:28:19.662067Z ERROR codex_core::session: failed to record rollout items: thread 01a17303-9dcf-7ff1-9f10-b7f5e649b0ee not found
- 2026-10-25T12:28:50Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · 2026-10-25T12:28:19.662067Z ERROR codex_core::session: failed to record rollout items: thread 01a17303-9dcf-7ff1-9f10-b7f5e649b0ee not found
- 2026-10-25T12:29:40Z · engineer crash recovery: resuming codex + gpt-6-luna (2/3 crashes in 30m) · Reading additional input from stdin...
- 2026-10-25T12:30:06Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6-luna) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-25T13:04:27Z · message_queued at 2026-10-25T13:04:27.668Z
- 2026-10-25T13:08:15Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T13:40:29Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
