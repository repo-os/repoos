---
updated_at: "2026-10-10T13:09:57Z"
review_passes: 5
id: "0753"
title: "Handoff shots: check or cross icon per shot, drop the duplicate verification block"
type: feature
status: review
needs_input: true
needs_input_reason: review-rounds-exhausted
needs_input_detail: The reviewer sent this back to the engineer 2 times and still found issues. Human review needed.
priority: p2
area: [web, ui]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/handoff-shots-check-or-cross-icon-per-sh
cli_override: claude code
model_override: haiku
review_cli_override: github copilot
review_model_override: default
created_at: "2026-10-10T10:13:24Z"
last_check_failure: "repoos check at 2026-10-10T12:21:48.960Z: repoos check failed: the worktree changed while the gate was running (HEAD moved from 2534079e to 6537a4c7) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable."
review_rounds: 2
dev_error_count: 1
---
## Problem

The Changes tab shows the handoff UI verification twice: a summary block (date, tested tree, sentence, console issues and warnings) and then the same shots again under UI changes. The summary block is extra text that repeats the shots. Users only need to know whether each shot is correct.

## Desired UX
- Remove the "Handoff UI verification" summary block from the Changes tab.
- Show one list: each shot is a row under UI changes. The row shows its caption and thumbnail, plus a green check (matches) or red cross (check).
- Hovering or focusing the icon opens a popover with the plain-words reason, for example "couldn't find the fullscreen toggle", and that shot's own console errors, failed same-origin requests, overflow and blank-capture issues.
- Issues belong to a shot. The gate already collects them per capture, but the stored record keeps one list for the whole handoff. Store each capture's issues on that capture, and show a run-level issue (one not tied to any shot) under the list as a single line.
- The tested tree and capture time go in one line above the list, not a separate block.

## Acceptance criteria
- [ ] The "Handoff UI verification" summary block no longer renders on the Changes tab.
- [ ] Each shot row under UI changes shows a green check or red cross, derived from the same step results as the current verdict.
- [ ] Each capture's console errors, failed same-origin requests, overflow and blank-capture issues are stored on that capture in the handoff record, and shown in that shot's popover.
- [ ] A run-level issue not tied to a shot is shown once under the list, not repeated per row.
- [ ] Hovering and keyboard focus both open the popover; tap opens it on touch screens.
- [ ] The popover uses the shared tooltip or popover component, not a native title attribute.
- [ ] Tests cover a matching shot, a checking shot with a failed step, a shot with its own console error, and a run-level issue.


## Notes for AI

- The verdict logic already exists in src/ui-app/src/lib/handoff-verification.ts. Reuse it; do not add a second one.
- The summary block lives in src/ui-app/src/components/TaskDrawer.vue under the Changes tab (search "Handoff UI verification"). The shot rows under UI changes are rendered by the same file or by shot-rows.ts.
- Display-only. Do not change how shots are captured or how handoff gates work.
- Use the shared popover or tooltip component under src/ui-app/src/components/ui. No native title tooltips.
- Rebuild the UI with `bun run build:ui` after changes.

## Related

- #0751 (the earlier verdict and details change this replaces in part)
- #0750 (the task whose Changes tab showed the duplicate block)

## Shots
```json
[
{
"label": "Task drawer Changes tab — verdict icons on each shot, no duplicate Handoff UI verification block",
"target": "default",
"route": "/work",
"highlight": ".ui-changes",
"steps": [
{
"waitFor": "[data-test-id=\"task-tab-changes\"]"
},
{
"click": "[data-test-id=\"task-tab-changes\"]"
},
{
"waitMs": 300
}
],
"state": "board:withReviewTask"
}
]
```

## Activity

- 2026-10-10T10:13:24Z · created · njachowski@gmail.com
- 2026-10-10T10:13:30Z · status inbox→ready
- 2026-10-10T10:13:32Z · status ready→active, branch
- 2026-10-10T10:16:00Z · body: section Desired UX
- 2026-10-10T10:16:01Z · body: section Acceptance criteria
- 2026-10-10T10:22:59Z · body
- 2026-10-10T10:24:04Z · body
- 2026-10-10T10:25:14Z · body
- 2026-10-10T10:27:09Z · body: section Shots
- 2026-10-10T10:28:01Z · body
- 2026-10-10T10:29:06Z · body
- 2026-10-10T10:30:26Z · agent exited with an error (opencode) · error: Session interrupted: shutdown
- 2026-10-10T10:53:57Z · body
- 2026-10-10T10:59:19Z · body
- 2026-10-10T11:00:03Z · body
- 2026-10-10T11:01:12Z · body
- 2026-10-10T11:03:48Z · body
- 2026-10-10T11:04:37Z · body: section Shots
- 2026-10-10T11:05:39Z · body
- 2026-10-10T11:12:10Z · status active→review
- 2026-10-10T11:12:28Z · note: click [data-task-id="9999"]: click: Timeout 5000ms exceeded. on /
- 2026-10-10T11:12:28Z · note: click [data-test-id="task-tab-changes"]: click: Timeout 5000ms exceeded. on /
- 2026-10-10T11:12:28Z · note: highlight .ui-changes matched nothing on /
- 2026-10-10T11:13:02Z · note: review pass 1: needs some work
- 2026-10-10T11:13:02Z · status review→active
- 2026-10-10T11:15:17Z · body: section Shots
- 2026-10-10T11:17:21Z · body
- 2026-10-10T11:24:10Z · status active→review
- 2026-10-10T11:24:11Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (4266b301b) during finalization (#0734)
- 2026-10-10T11:24:11Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (4266b301b) during finalization (#0734)
- 2026-10-10T11:25:00Z · note: review pass 2: needs some work
- 2026-10-10T11:25:00Z · status review→active
- 2026-10-10T11:25:53Z · body: section Shots
- 2026-10-10T11:30:22Z · body
- 2026-10-10T11:37:01Z · status active→review
- 2026-10-10T11:37:01Z · note: shots: skipped — 1 shot already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-10T11:37:54Z · note: review pass 3: needs some work
- 2026-10-10T12:10:49Z · cli_override, model_override
- 2026-10-10T12:10:51Z · model_override
- 2026-10-10T12:11:01Z · needs_input (dev-error) dismissed by hello@repoos.org
- 2026-10-10T12:11:07Z · status review→active
- 2026-10-10T12:11:39Z · body: section Shots
- 2026-10-10T12:12:19Z · body
- 2026-10-10T12:14:27Z · body
- 2026-10-10T12:15:31Z · body
- 2026-10-10T12:22:31Z · body
- 2026-10-10T12:25:14Z · review_cli_override, review_model_override
- 2026-10-10T12:28:43Z · status active→review
- 2026-10-10T12:28:44Z · note: shots: skipped — 1 shot already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-10T12:30:34Z · note: review pass 4: needs some work
- 2026-10-10T12:30:34Z · needs_input
- 2026-10-10T12:53:11Z · needs_input
- 2026-10-10T12:53:11Z · status review→active
- 2026-10-10T12:53:11Z · note: follow-up message — moved from review to active so work can be committed and re-handoffed
- 2026-10-10T12:54:52Z · body
- 2026-10-10T12:56:07Z · body
- 2026-10-10T13:00:51Z · body
- 2026-10-10T13:02:01Z · body
- 2026-10-10T13:08:22Z · status active→review
- 2026-10-10T13:08:22Z · note: shots: skipped — 1 shot already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-10T13:09:57Z · note: review pass 5: needs some work
- 2026-10-10T13:09:57Z · needs_input

