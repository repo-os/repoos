---
id: "0861"
title: "P0: bookkeeping-only commits must not make handoff evidence stale or block a good review"
type: bug
status: done
priority: p0
area: [server, core, web]
merged_commit: 8fe8ff881a77ac376285894ddfcfc14ce064adf5
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/p0-bookkeeping-only-commits-must-not-mak
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-20T04:47:38Z"
updated_at: "2026-10-20T11:07:15Z"
last_close_out_gate_ms: 122774
last_close_out_gate_at: "2026-10-20T11:06:21.574Z"
review_passes: 13
last_check_failure: "repoos check at 2026-10-20T07:15:20.788Z: repoos check failed: rendered-contrast — $ bun scripts/ui-contrast-audit.mjs"
dev_error_count: 1
---
## Problem
A task whose code is correct is repeatedly held in review because its screenshot/verification evidence is flagged **stale** when the only commits since the capture are RepoOS bookkeeping. Example (#0843, 2026-10-20): review pass 10 found no bugs and no edge cases, but the verdict was "needs some work" with `Evidence: ... captured at d87648624, while reviewed HEAD is b1eda86f8. The only intervening change is task-file bookkeeping, but the capture is still stale by the handoff evidence rule.` It then needed a manual `repoos verify` + `repoos review again` to get another pass (which found a new unrelated issue, but the stale-evidence round was pure waste). The same thing happened to #0832 and others.

Root cause: the tested-tree identity is just the short HEAD sha of the task worktree (`headIdentity` in `src/server/shot-capture.ts`, ~line 133). Every commit changes it, including `docs(<id>): update task` / activity-log commits on the task file, engineer WIP checkpoints that touch only task files, and main-sync merges that only bring in other tasks' `work/*.md`. The review prompt (src/server/review.ts ~2262, `STALE-EVIDENCE-ONLY`), the Changes tab "Stale capture" flag (`src/ui-app/src/lib/handoff-verification.ts`), `reusableAutoCaptures` (shot reuse) and the auto-refresh setting all compare that sha. Meanwhile the close-out guard already treats `work/*.md`-only commits as harmless ("Move to done compares the worktree to the handoff snapshot and refuses when HEAD moved ... except commits that change only work/*.md task files").

## Desired UX
Evidence is stale only when something that can change what the shots show has changed. Define "evidence is current" as: the diff between the captured commit and the reviewed HEAD touches **no non-bookkeeping path**. Bookkeeping paths are the same set the close-out already treats as server-written: `work/`, `inputs/`, `stories/`, plus (once #0860 lands) `reminders/` and `schedules/`, read from config (`workDir`, `inputsDir`, `storiesDir`, `remindersDir`, `schedulesDir`), and `.repoos/` / attachments.
- A bookkeeping-only delta never produces `STALE-EVIDENCE-ONLY`, never shows the "Stale capture" flag, never triggers a refresh or a re-capture, and never counts as a reason for "needs some work".
- A delta that touches any real path (source, tests, docs, config, `repoos.toml`, package files) is stale exactly as today.
- The reviewer is told, in its prompt, when the capture is from an earlier commit but only bookkeeping changed, so it does not report that as a finding.
- `repoos verify`, `repoos review again` and the auto-refresh setting use the same definition, so "refresh evidence" is offered only when it would change something.

## Acceptance criteria
- A single shared helper (for example `isEvidenceCurrent(capturedSha, headSha, config)`) computes the bookkeeping-aware comparison with `git diff --name-only`, fails closed (unknown or unreadable git state means stale), and is unit-tested: bookkeeping-only delta is current; a source change is stale; a mixed delta is stale; a merge commit that only brings in other tasks' task files is current; a missing/unknown captured sha is stale; custom `workDir`/`inputsDir`/`storiesDir` layouts (including the `repoos/` namespace) are honoured.
- The reviewer prompt, the Changes tab flag, shot reuse and auto-refresh all call that helper; tests cover each caller (a task with only `docs(<id>): update task` commits after capture reviews as current evidence and the verdict is not clamped to "needs some work").
- No change to what is captured or how shots are named; `sourceIdentity` remains recorded for display.
- docs/previews.md and user-docs/review-and-close-out.md explain the new definition.

## Notes for AI
Reuse whatever the close-out guard uses to recognise `work/*.md`-only commits (src/server/worktree-handoff-guard.ts and the integration orchestrator's `bookkeepingDirs`) rather than adding a parallel path list. Check src/server/review.ts (~2262-2300), src/server/shot-capture.ts (`headIdentity`, `reusableAutoCaptures`), src/server/ui-handoff-gate.ts and src/ui-app/src/lib/handoff-verification.ts. Keep it fail-closed. Related: #0766 (refresh evidence on demand), #0734, #0600 (work/*.md-only commits tolerated at close-out), #0860 (reminders/schedules as bookkeeping). Do not touch repoos.toml. Source: Nick, 2026-10-20 (#0843 pass 10).

## Shots
```json
[
{
"label": "Changes tab with bookkeeping-current handoff evidence",
"target": "default",
"route": "/work?task=9999&tab=changes",
"state": "drawer:shotEvidence"
}
]
```

## Activity

- 2026-10-20T04:47:38Z · created · njachowski@gmail.com
- 2026-10-20T04:47:52Z · status inbox→ready
- 2026-10-20T04:47:56Z · cli_override, model_override
- 2026-10-20T04:47:58Z · status ready→active, branch
- 2026-10-20T04:56:29Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-10-20T04:56:46Z · agent exited with an error (codex) · 2026-10-20T04:56:32.304823Z ERROR codex_models_manager::manager: failed to refresh available models: Connection failed: error sending request
- 2026-10-20T05:49:27Z · needs_input
- 2026-10-20T05:53:43Z · body
- 2026-10-20T05:57:42Z · body
- 2026-10-20T06:17:09Z · message_queued at 2026-10-20T06:17:09.557Z
- 2026-10-20T06:17:09Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-20T06:25:12Z · body
- 2026-10-20T06:26:29Z · message_queued at 2026-10-20T06:26:29.923Z
- 2026-10-20T06:56:38Z · message_delivered: 2 message(s)
- 2026-10-20T07:03:28Z · body
- 2026-10-20T07:06:06Z · body
- 2026-10-20T07:18:08Z · body
- 2026-10-20T07:23:49Z · status active→review
- 2026-10-20T07:30:24Z · note: review pass 1: needs some work
- 2026-10-20T07:32:16Z · status review→active
- 2026-10-20T07:32:16Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T07:35:50Z · body
- 2026-10-20T07:43:27Z · message_queued at 2026-10-20T07:43:27.404Z
- 2026-10-20T07:43:29Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-20T07:46:38Z · body
- 2026-10-20T08:15:26Z · body
- 2026-10-20T08:16:19Z · body
- 2026-10-20T08:16:43Z · status active→review
- 2026-10-20T08:19:42Z · note: review pass 2: needs some work
- 2026-10-20T08:21:24Z · note: review pass 3: needs some work
- 2026-10-20T08:23:05Z · note: review pass 4: needs some work
- 2026-10-20T08:26:12Z · note: review pass 5: needs some work
- 2026-10-20T08:28:35Z · note: review pass 6: needs some work
- 2026-10-20T08:38:08Z · note: review pass 7: needs some work
- 2026-10-20T08:52:15Z · note: review pass 8: needs some work
- 2026-10-20T08:56:21Z · note: review pass 9: needs some work
- 2026-10-20T08:58:55Z · note: review pass 10: needs some work
- 2026-10-20T09:02:45Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T09:02:51Z · note: review pass 11: needs some work
- 2026-10-20T09:03:19Z · needs_input
- 2026-10-20T09:07:34Z · needs_input
- 2026-10-20T09:07:34Z · status review→active
- 2026-10-20T09:07:34Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-20T09:07:35Z · message_delivered: 1 message(s)
- 2026-10-20T09:08:46Z · body
- 2026-10-20T09:09:03Z · body
- 2026-10-20T09:13:45Z · body
- 2026-10-20T09:14:52Z · status active→review
- 2026-10-20T09:17:38Z · note: review pass 12: needs some work
- 2026-10-20T09:20:26Z · note: review pass 13: good to go
- 2026-10-20T11:06:21Z · close-out gate completed in 123s
- 2026-10-20T11:07:15Z · status review→done, release:success
