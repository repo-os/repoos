---
id: "0958"
title: "Bug: RepoOS re-enables git fsmonitor on every server start (one daemon per worktree, load spikes); respect a human's false and add an off switch"
type: bug
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "✗ handoff deferred — read the queued message(s) first, then request review again"
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/bug-repoos-re-enables-git-fsmonitor-on-e
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-25T11:34:02Z"
updated_at: "2026-10-25T18:04:35Z"
dev_error_count: 8
engineer_crash_log: "[{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-10-25T18:04:35.221Z\",\"kind\":\"dev-error\"}]"
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

## More evidence: preview/shot servers also re-enable it
Not only the launchd server: ANY RepoOS server process calls tuneRepoForScale(config.root) at start, including task preview servers, 'just serve-noauth', and the servers 'repoos shot' / handoff shot capture start from a task worktree. Because worktrees share the repo's .git/config, each of those starts rewrites core.fsmonitor=true and core.untrackedCache=true for the WHOLE repo, which respawns ~30 fsmonitor daemons (one per worktree). Observed 2026-10-25: after 'just clear' set both to false, #0951's engineer started 'just serve-noauth 7272' and then a second server from its worktree, and within seconds the config was true again and 27 daemons were back. Required: tuneRepoForScale must be skipped entirely in preview mode (REPOOS_PREVIEW_CHILD / --preview-overrides / any server whose root is a linked worktree) and must never override an explicit human setting; add a test that starts a preview-mode server over a worktree and asserts the shared config is unchanged.

## Shots
```json
[
{
"label": "New Git status acceleration toggle in Settings - General - Performance",
"target": "default",
"route": "/settings?setting=git.tuneForScale",
"highlight": "[id=\"setting-git.tuneForScale\"]",
"steps": [
{
"waitMs": 1500
}
]
}
]
```

## Activity

- 2026-10-25T11:34:02Z · created · njachowski@gmail.com
- 2026-10-25T11:35:12Z · status inbox→ready
- 2026-10-25T11:35:27Z · cli_override, model_override
- 2026-10-25T11:35:28Z · status ready→active, branch
- 2026-10-25T12:02:09Z · message_queued at 2026-10-25T12:02:09.828Z
- 2026-10-25T12:02:10Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-25T12:05:48Z · agent exited with an error (codex) · the agent process exited with an error — open the task to see the full output
- 2026-10-25T12:05:48Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-10-25T12:05:51Z · message_delivered: 1 message(s)
- 2026-10-25T12:13:01Z · body: More evidence: preview/shot servers also re-enable it (added)
- 2026-10-25T12:13:01Z · message_queued at 2026-10-25T12:13:01.517Z
- 2026-10-25T12:17:09Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T12:21:05Z · cli_override, model_override
- 2026-10-25T12:21:09Z · needs_input
- 2026-10-25T12:21:09Z · message_queued at 2026-10-25T12:21:09.661Z
- 2026-10-25T12:28:12Z · agent exited with an error (codex) · 2026-10-25T12:28:11.157970Z ERROR codex_core::session: failed to record rollout items: thread 01a172f3-eeea-7400-b3e6-187ab6d38b71 not found
- 2026-10-25T12:28:12Z · engineer crash recovery: resuming codex + gpt-6-luna (2/3 crashes in 30m) · 2026-10-25T12:28:11.157970Z ERROR codex_core::session: failed to record rollout items: thread 01a172f3-eeea-7400-b3e6-187ab6d38b71 not found
- 2026-10-25T12:28:17Z · message_delivered: 2 message(s)
- 2026-10-25T13:07:11Z · message_queued at 2026-10-25T13:07:11.463Z
- 2026-10-25T13:07:12Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-25T13:12:12Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T13:29:22Z · engineer stopped by request
- 2026-10-25T13:29:23Z · needs_input
- 2026-10-25T13:29:30Z · needs_input
- 2026-10-25T14:01:58Z · body
- 2026-10-25T14:10:18Z · message_overdue: still queued after 60m without being delivered
- 2026-10-25T14:12:05Z · needs_input
- 2026-10-25T14:12:12Z · held
- 2026-10-25T14:12:30Z · status active→ready
- 2026-10-25T14:14:14Z · assigned_to
- 2026-10-25T14:54:41Z · assigned_to
- 2026-10-25T14:54:49Z · released
- 2026-10-25T14:55:11Z · status ready→active
- 2026-10-25T14:55:18Z · cli_override, model_override
- 2026-10-25T14:55:30Z · message_delivered: 1 message(s)
- 2026-10-25T14:55:34Z · message_queued at 2026-10-25T14:55:34.367Z
- 2026-10-25T15:00:18Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T15:15:29Z · note: handoff requested (ui-review)
- 2026-10-25T15:27:46Z · agent exited with an error (opencode) · error: Transport
- 2026-10-25T15:30:46Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · error: Transport
- 2026-10-25T15:32:57Z · message_delivered: 1 message(s)
- 2026-10-25T15:36:32Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (2/3 crashes in 30m) · error: Transport
- 2026-10-25T15:38:12Z · engineer stopped by request
- 2026-10-25T15:38:12Z · needs_input
- 2026-10-25T15:38:15Z · needs_input
- 2026-10-25T15:38:26Z · needs_input
- 2026-10-25T15:38:36Z · held
- 2026-10-25T15:39:12Z · assigned_to
- 2026-10-25T15:40:28Z · status active→ready
- 2026-10-25T16:15:48Z · assigned_to
- 2026-10-25T16:15:55Z · released
- 2026-10-25T16:16:14Z · status ready→active
- 2026-10-25T16:16:20Z · model_override
- 2026-10-25T16:16:29Z · message_queued at 2026-10-25T16:16:29.515Z
- 2026-10-25T16:16:34Z · body
- 2026-10-25T16:20:58Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T16:50:49Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T16:53:06Z · agent exited with an error (opencode) · error: Reconnect OpenCode Console to continue.
- 2026-10-25T16:53:06Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4-pro (1/3 crashes in 30m) · error: Reconnect OpenCode Console to continue.
- 2026-10-25T16:53:10Z · message_delivered: 1 message(s)
- 2026-10-25T16:53:17Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4-pro (2/3 crashes in 30m) · error: Reconnect OpenCode Console to continue.
- 2026-10-25T16:53:23Z · engineer crash recovery: surfaced instead of switching — a human-set task override (opencode + opencode-go/deepseek-v4-pro) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-25T16:54:29Z · cli_override, model_override
- 2026-10-25T16:54:35Z · needs_input
- 2026-10-25T16:54:36Z · message_queued at 2026-10-25T16:54:36.266Z
- 2026-10-25T17:20:01Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T17:34:20Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T17:43:40Z · body
- 2026-10-25T17:46:43Z · body
- 2026-10-25T17:53:45Z · body
- 2026-10-25T17:58:07Z · body
- 2026-10-25T18:03:16Z · message_overdue: still queued after 60m without being delivered
- 2026-10-25T18:04:34Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-25T18:04:34Z · agent exited with an error (codex) · ✗ handoff deferred — read the queued message(s) first, then request review again
- 2026-10-25T18:04:35Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · ✗ handoff deferred — read the queued message(s) first, then request review again
