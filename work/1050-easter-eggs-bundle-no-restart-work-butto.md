---
id: 1050
title: "Easter eggs bundle: no Restart work button while checks run"
type: chore
status: active
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-no-restart-work-butto
created_at: "2026-11-07T07:03:41Z"
updated_at: "2026-11-07T16:22:33Z"
---
## Items
## Items

- [x] **E1 · No Restart work button while checks run** (web) — while a handoff or check is running for an active task, the card and drawer show no primary button (the "running checks" status already says it). Source: human report 2026-11-07 (screenshot of #1047's card).
- [x] **E2 · Close the Uncommitted changes panel after a successful commit** (web) — After a successful commit from the Uncommitted changes side panel (RepoDirtyPanel.vue commit()), close the panel. The success toast already reports the commit (files, branch, sha), and the panel otherwise stays open reading "Uncommitted changes · Working tree is clean." with the "Committed 1 file to main (96d818687)." note, which is odd. Remove the now-redundant in-panel committedNote or keep it only if the panel stays open. Keep the panel open on failure (error and hook output stay visible). If the commit leaves other files uncommitted (dirtyCount > 0 after refresh) decide explicitly: close anyway, since the toast reports what happened. Source: human report 2026-11-07 (screenshot of the panel after a commit).
- [x] **E3 · Collapse repeated agent stderr lines in the chat and stop styling them as errors** (web) — In the task drawer's Dev chat, identical consecutive stderr lines from the agent CLI are collapsed into one neutral expandable entry with a count and first/last time. Source: human report 2026-11-07 (screenshot of #1047's Dev chat full of red Error cards).

## E1 · No Restart work button while checks run

### Problem
An `active` task whose engineer has exited and whose server-side handoff or check is running shows "RUNNING CHECKS" as its status but "Restart work" as its main button (seen on #1047 on 2026-11-07). `TaskCard.vue` (the `action` computed, `t.status === "active"`) chooses Pause or Restart only from `repo.isRunning(t.id)` (is an engineer agent process running), which is a different signal from the "running checks" hint. The drawer has the same pattern: the `task-drawer-start-work` button shows "Restart work" for an active task when `!repo.isRunning(...)`. Clicking it mid-check could start a second engineer on a branch that is being verified.

### Desired UX
- While a handoff or check is running for the task (any step: commit, check, verify, review), the card shows NO primary action button, and the drawer hides "Restart work" (and the request-review button, which has the same gap if it is not already gated on `handoffBusy`). The "running checks · <step>" status already carries the information, so a disabled or duplicate button would only repeat it.
- When the handoff ends (passed, failed or cancelled) the normal buttons come back: Restart work if no engineer is running, Pause work if one is.
- Tasks with no handoff running are unchanged.
- Use the same "handoff running" signal the "running checks" hint uses, so the button and the status can never disagree. If #1047 (task card and panel show running checks clearly) has landed, reuse its server-backed handoff-status source, so this also holds after a reload and for CLI-requested handoffs.

### Acceptance criteria
- Test: an `active` task with a running handoff and no running engineer renders no primary action button on the card, and no Restart work or Start work button in the drawer.
- Test: the same task after the handoff ends (passed and failed) renders Restart work again.
- Test: an `active` task with a running engineer still renders Pause work, and one with neither shows Restart work.
- Test: the card's status text and its button visibility are derived from the same handoff-running value (one shared helper or computed).

### Notes for AI
Start from the `action` computed in `src/ui-app/src/components/TaskCard.vue` (about line 1126, `ACTIVE_PAUSE` / `ACTIVE_RESTART`) and the `task-drawer-start-work` and `task-drawer-request-review` buttons in `src/ui-app/src/components/TaskDrawer.vue` (about line 5430). Depends on #1047 landing first so the handoff-running signal is the server-backed one; do not duplicate its logic. Source: human report 2026-11-07.


## E2 · Close the Uncommitted changes panel after a successful commit

### Problem


### Desired UX


### Acceptance criteria

- Test: Component test: a successful commit closes the panel and shows the success toast; a failed commit keeps it open with the error and hook output; a commit that leaves the tree clean does not leave the 'Working tree is clean' state visible.

### Notes for AI


## E3 · Collapse repeated agent stderr lines in the chat and stop styling them as errors

### Problem


### Desired UX


### Acceptance criteria

- Test: Component test: 21 identical stderr events render as one entry with a x21 count and an expandable detail; a different stderr line breaks the run; a stderr line is not styled as an error while the agent keeps producing normal messages, but a real turn failure still renders as an error; the count updates as new identical lines arrive.

### Notes for AI

## Activity

- 2026-11-07T07:03:41Z · created · njachowski@gmail.com
- 2026-11-07T07:03:45Z · depends_on
- 2026-11-07T07:23:43Z · held, held-reason, held-at
- 2026-11-07T07:57:46Z · body: Items (added 1); E2 · Close the Uncommitted changes panel after a successful commit (added)
- 2026-11-07T07:57:46Z · note: bundle add E2
- 2026-11-07T11:02:36Z · body: Items (added 1); E3 · Collapse repeated agent stderr lines in the chat and stop styling them as errors (added)
- 2026-11-07T11:02:36Z · note: bundle add E3
- 2026-11-07T13:13:42Z · needs_input
- 2026-11-07T13:20:01Z · body: Items (added 1, removed 1)
- 2026-11-07T13:20:01Z · note: bundle done E1
- 2026-11-07T13:57:20Z · status inbox→ready
- 2026-11-07T16:01:49Z · released
- 2026-11-07T16:01:51Z · status ready→active, needs_input, branch
- 2026-11-07T16:14:16Z · body
- 2026-11-07T16:17:51Z · body
- 2026-11-07T16:22:33Z · body: Items (added 2, removed 3)
- 2026-11-07T16:22:33Z · message_queued at 2026-11-07T16:22:33.621Z
