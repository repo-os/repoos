---
id: 1047
title: "Task card and panel: show running checks clearly, with a live progress bar"
type: bug
status: inbox
priority: p2
area: [web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
cli_override: codex
model_override: default
created_at: "2026-11-07T00:21:00Z"
updated_at: "2026-11-07T00:49:51Z"
---
## Problem

While the server runs a task's handoff checks, the card and drawer can show "paused" (card) or "stuck · silent 7m" and "Quiet — may be stalled" (drawer), although the checks are running. Seen on #1046 on 2026-11-07: `repoos handoff-status 1046` said `running` at step `check`, the Checks page showed Slot 0 held by #1046 (PID 20002 alive, heartbeat 2s ago, held 8 minutes), and the chat itself said "Verifying the worktree and running repoos check". The same happened to #1041 earlier. Screenshots 1 (drawer) and 2 (Checks page) are attached.

Cause found: `handoffInFlight(id)` in `src/ui-app/src/stores/repo.ts` (about line 1407) is true only when the page received a live `handoff:*` SSE step, or when the hydrated check history has a running `handoff-finalize` run. For #1046 `GET /api/tasks/1046/checks` returned `runs: []` while the server's handoff status was `running`, and the handoff had been requested from the CLI, so a page opened or reloaded afterwards never learns about it. `TaskCard.vue` then falls through to "paused" (agent stopped), and the drawer's auto-repair hint reads the agent's silence as "stuck".

## Desired UX

- While any handoff or check is running for the task, the card says "running checks" and the drawer says the same, with the step (commit, check, verify, review) and how long it has run. The stuck and quiet banners are suppressed while the server owns the task.
- This holds after a reload, on a second device, and for handoffs requested from the CLI.
- If the check run list is empty but a local check slot is held by this task, that also counts as running.

## Acceptance criteria

- The task card and drawer read the server's own handoff status (the source `repoos handoff-status` uses, `readHandoffStatus` in `src/server/handoff-status.ts`) or an equivalent field in the task payload or SSE snapshot, not only live events and the check-run list.
- A task in `active` with a running handoff shows "running checks · <step>" on the card and in the drawer after a page reload, with no live SSE event.
- The drawer's "stuck · silent" and "Quiet — may be stalled" banners do not show while a handoff is running.
- Find out why `runs` was empty during a server-side check, and either record the run or document why not (see the run start in `src/server/handoff.ts` around line 780).
- Tests cover a reload during a CLI-requested handoff.

## Notes for AI

Start from `TaskCard.vue` (the active branch of the status hint, about lines 985-1050, and the onMounted hydration), `stores/repo.ts` (`handoffInFlight`, `handoffSteps`, `refreshTaskChecks`) and the auto-repair hint code that produces "stuck · silent". Prefer polling or snapshotting the existing handoff status over adding a new store.

## Progress bar (bring it back)
The task panel used to show a realtime progress bar for checks and tests. It still exists in code but is switched off: `TaskDrawer.vue` has the block `v-if="false && inPipeline && activeCheckRun"` (data-test-id `close-out-check-progress`, a `<progress>` plus `checkProgressLabel`), disabled by #0952 on 2026-10-25 when the status card was redesigned, and it was only ever placed in the review and close-out button area.

Wanted: a progress bar in the task panel status card above the tabs, visible whenever a handoff, check or close-out gate is running for the task:
- Percent from steps done over total (`checkProgressPercent`), with the label from `checkProgressLabel` (e.g. "step 5 of 12 · tests 140/289 files") and the current step name; when totals are unknown show the step count without inventing a percent.
- Test progress (files done over total) while the tests step runs, driven by the `::repoos-check-progress::` markers the check already emits (`stepsDone`, `stepsTotal`, `currentStep`, `stepName`, `testsDone`, `testsTotal`) and parsed in `stores/repo.ts` (~line 2062).
- It must work after a reload and for CLI-requested and server-side runs, so the progress has to come from the server's handoff status or a snapshot field, not only from the in-memory `repo.taskChecks` list (which was empty for #1046's server-side check). Include progress in the handoff status the card reads.
- The task card gets a thin version of the same bar.
- Also show attempt number and which machine runs it, as the old block did.
- Accessible: `role="progressbar"` with values, or the native `<progress>`, readable and not colour-only.

Acceptance: a task whose handoff checks run shows the bar in the panel above the tabs and on the card, advancing as steps and test files complete, after a reload; a test covers percent, unknown totals and the reload case; a declared shot (fixture `shot-check-progress` already exists in `shot-preview-fixtures.ts`) shows the bar.

## Screenshots

![11](/api/tasks/1047/attachments/att_d53d06e7-472f-4f22-8ab7-98a6aebeaed6.png)
![12](/api/tasks/1047/attachments/att_318f0283-0172-40bd-bea6-2c868fffe8c0.webp)

## Activity

- 2026-11-07T00:21:00Z · created · njachowski@gmail.com
- 2026-11-07T00:21:00Z · screenshots
- 2026-11-07T00:29:44Z · title, body: Progress bar (bring it back) (added)
- 2026-11-07T00:49:51Z · cli_override, model_override
