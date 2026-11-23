---
id: "1124"
title: "Worktree cleanup: decide and build the safe handling for 'unsafe' (protected) task worktrees"
type: feature
status: done
priority: p3
area: [core, server]
merged_commit: b2cfb8ea015c22f5757966cfad81b00170bbd914
assigned_to: ai
created_by: t@t
branch: feat/worktree-cleanup-decide-and-build-the-sa
created_at: "2026-11-15T00:41:58Z"
updated_at: "2026-11-23T09:38:04Z"
last_close_out_gate_ms: 354149
last_close_out_gate_at: "2026-11-23T09:38:04.640Z"
review_passes: 1
handoff_signal_retry_count: 2
last_check_failure: "repoos check at 2026-11-23T08:04:26.772Z: repoos check failed: ui verification failed (1 issue(s)): [missing-target] Protected worktree triage preview (target \"default\"): loading state detected: loading text \"Loading…\" on /control?shotState=system:worktreeGc (http://127.0.0.1:55926/control?shotState=system:worktreeGc)"
---
## Problem

`repoos gc` only removes worktrees RepoOS proves safe (task merged and done, clean tree). The safe case will be handled by a simple scheduled job (see #1055, which is on hold). That leaves the 'unsafe' worktrees: ones `repoos gc --dry-run` protects because the task is active, in review, held, human-assigned, has a dirty tree, or has an unmerged branch (including done/archived tasks whose branch never merged). Today they pile up forever and nobody decides what to do with them.

We have not decided how to handle these. This task is to decide that, then build only the non-destructive parts.

## Acceptance criteria

- [ ] A short design note in docs/ lists every protected-worktree class that `repoos gc --dry-run` reports on this repo (with counts and examples), and for each class states the recommended action: keep, ask the human, archive then remove, or fix the underlying bug.
- [ ] `repoos gc --dry-run` (or a new read-only `repoos gc --report`) lists each protected worktree with its class, age, last commit date, whether the branch is merged, and the recommended action, in plain text and JSON.
- [ ] The Worktrees view (or the existing place protected worktrees are shown) shows the same class and recommended action, so a human can triage without the CLI.
- [ ] Any removal of an unsafe worktree requires explicit per-worktree human confirmation, and RepoOS first preserves the work (for example a git bundle or an archive tag of the branch tip plus a record of the dirty diff) so nothing is lost. A test proves a dirty or unmerged worktree is never removed without that confirmation and that the preserved copy can be restored.
- [ ] No unsafe worktree or branch is removed by this task itself, and no scheduled job ever removes an unsafe one. Safe-case cleanup (#1055) is untouched.

## Notes for AI

Read #1055 and src for `repoos gc` first. Do not widen what gc auto-removes. Design the classes from the real dry-run output, not guesses. Keep zero runtime dependencies. If a class is better solved by fixing why the worktree was left behind (for example a close-out that fails to clean up), file that as its own task instead of working around it here.

## Shots
```json
[
{
"label": "Protected worktree triage preview",
"target": "default",
"route": "/control?shotState=system:worktreeGc",
"highlight": ".gc-preview",
"steps": [
{
"click": ".gc-tooltip-trigger button.gc-action"
}
]
}
]
```

## Activity

- 2026-11-15T00:41:58Z · created · t@t
- 2026-11-23T07:34:49Z · status inbox→ready
- 2026-11-23T07:34:51Z · status ready→active, branch
- 2026-11-23T07:41:33Z · watchdog: check wait escalated · waiting: waiting for serialized local fallback (1 ahead, position 2); slot holder 9249 is dead for 14s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-23T07:47:04Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-23T07:55:58Z · body
- 2026-11-23T07:59:34Z · CTO nudge: held — handoff gate is running
- 2026-11-23T08:04:23Z · note: ui verification failed (1 issue(s)): [missing-target] Protected worktree triage preview (target "default"): loading state detected: loading text "Loading…" on /control?shotState=system:worktreeGc (http://127.0.0.1:55926/control?shotState=system:worktreeGc)
- 2026-11-23T08:04:23Z · message_queued at 2026-11-23T08:04:23.761Z
- 2026-11-23T08:04:25Z · orphaned run process stopped · pid 65997 · /opt/homebrew/Cellar/bun/1.4.2/bin/bun /Users/nick/code/nick/repoos-worktrees/feat/worktree-cleanup- · cpu 0s · age 17s
- 2026-11-23T08:04:48Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-23T08:09:57Z · message_queued at 2026-11-23T08:09:57.307Z
- 2026-11-23T08:15:12Z · message_queued at 2026-11-23T08:15:12.809Z
- 2026-11-23T08:19:03Z · message_delivered: 1 message(s)
- 2026-11-23T08:21:54Z · queued message undelivered for 12m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-23T08:21:54Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The target was valid, but the dashboard also mounts `DecisionDigestPanel`, which showed `Loading…` while its live API request was pending. I found an existing pattern that suppresses that transient spinner for other dashboard shots. I’ll e… · stderr: (empty)
- 2026-11-23T08:21:54Z · message_delivered: 2 message(s)
- 2026-11-23T08:47:29Z · note: adopted orphaned engineer pid 70173
- 2026-11-23T08:52:48Z · body
- 2026-11-23T08:57:28Z · CTO nudge: held — handoff gate is running
- 2026-11-23T09:19:03Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-23T09:19:12Z · status active→review
- 2026-11-23T09:19:14Z · message_queued at 2026-11-23T09:19:14.209Z
- 2026-11-23T09:20:39Z · note: review pass 1: good to go
- 2026-11-23T09:38:04Z · close-out gate completed in 354s

