---
id: 1050
title: "Easter eggs bundle: no Restart work button while checks run"
type: chore
status: inbox
priority: p3
area: web
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-07T07:03:41Z"
updated_at: "2026-11-07T07:03:41Z"
---
## Items

- [ ] **E1 · No Restart work button while checks run** (web) — while a handoff or check is running for an active task, the card and drawer show no primary button (the "running checks" status already says it). Source: human report 2026-11-07 (screenshot of #1047's card).

Each item below has the same parts: Problem, Desired UX, Acceptance criteria, Notes for AI. Edit one item at a time with `--section`; never resend the whole body. Add related small fixes as `E2`, `E3` before this bundle starts.

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

## Activity

- 2026-11-07T07:03:41Z · created · njachowski@gmail.com
