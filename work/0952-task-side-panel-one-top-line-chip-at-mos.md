---
id: "0952"
title: "Task side panel: one top-line chip, at most one card and one status line above the tabs, help text in info popovers"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/task-side-panel-one-top-line-chip-at-mos
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-24T23:16:59Z"
updated_at: "2026-10-24T23:22:27Z"
---
## Problem

The task side panel gets cluttered when a task reaches review or hits issues. Examples are in the attached screenshots (#0943, #0945, #0947, #0950):

- The top line (task number, file name, priority) fills up with long, low-value chips: "CHECKS PASSED · 37S", "CHECKS FAILED · 4M 15S", "Reviewer failed — no report", "REVIEW FINDINGS", "CHECKS RUNNING ON REMOTE HOST · STEP — · TESTS 6/595 FILES · 2M 47S". The line is too small for sentences, so the file name wraps to many lines (one screenshot has it 8 lines tall).
- Large cards stack above the tabs ("Not moved to review...", "Not landable yet", "WAITING FOR YOU", "TL;DR — WHAT HAPPENED", the remote-handoff run text), several at once, pushing the tabs far down the panel.
- Cards end with canned explanatory paragraphs ("Read the latest review report, then send it to the engineer...", "Try Review again from the Review tab...", "This task stays active until the checks pass.") that take up space on every view.
- Status cards appear in inconsistent places, sometimes splitting the rows above the preview line.

## Desired UX

1. Top line (task number, file name, priority): at most ONE dynamic chip, a few words max (for example "Checks failed", "Reviewer timed out", "Needs input"), never a sentence, no durations, and never a chip that restates the status already shown (do not show "Review findings" when the task is in Review). Success and routine facts ("Checks passed · 37s") are not chips at all: they live in the Review / Debug / log tabs. A duration only appears, as a red/warning treatment on the chip, when it was longer than expected. The file name is never more than 2 lines; if it would be, the chip is too long.
2. Anything longer than a few words goes BELOW the preview line and ABOVE the tabs, never above the preview line and never splitting the rows above it. This is the only region where status content may appear.
3. At most ONE card plus ONE status line in that region. The card is the single most important thing (for example the "Waiting for you" card, or the landable summary, or the failure), and the status line is a one-liner like "Confirming handoff · active just now" or "Running repoos check… (progress bar)". If several states apply, show the highest-priority card and fold the rest into it as short lines or into the tabs; define the priority order in one place.
4. No canned help paragraphs in cards. Replace "Read the latest review report…", "Try Review again…", "This task stays active until the checks pass" and similar with a small info icon (keyboard-focusable, works on touch) that opens a styled popover with that text. Do not use a native title tooltip (AGENTS.md convention).
5. The TL;DR "what happened" content is merged into the one card or moved behind the info popover; it must not be a separate large card.

## Acceptance criteria

- [ ] The top line shows at most one dynamic chip of a few words, with no duration (except a red over-expected-duration treatment), and never restates the current status.
- [ ] "Checks passed · Ns", "Review findings", "Checks failed · 4m 15s", "Reviewer failed — no report" style chips are gone or reduced to a short label; their detail is available in the log/Review/Debug tabs.
- [ ] The file name wraps to at most 2 lines at the panel widths in the screenshots, and the layout is verified at narrow and wide panel widths.
- [ ] All status cards render only between the preview line and the tabs; nothing renders between the title/state rows and the preview line.
- [ ] At most one card and one status line are visible in that region at any time, chosen by a single documented priority function with a unit test covering the combinations seen in the screenshots (review failed no report, not landable, handoff failed, checks running, confirming handoff, checks failed after retries, waiting for you).
- [ ] All canned explanatory paragraphs are replaced by an info icon with an accessible popover (keyboard focus, touch, `data-overlay-layer` where teleported); no native title tooltips.
- [ ] Existing actions (Send to engineer, Review again, Dismiss, Restart work, Move to done) remain reachable from the one card.
- [ ] Declare `## Shots` with the drawer states from the screenshots (review failed, not landable, checks running, confirming handoff, checks failed after retries) at a normal and a narrow panel width, and look at them yourself.
- [ ] Update affected tests and user-docs; the contrast audit and hard-coded-color guard pass in all themes.

## Notes for AI

- The panel is `src/ui-app/src/components/TaskDrawer.vue` (large) and its sub-components; find where the top-line chips and the status cards are produced and consolidate them behind one status-summary computation rather than editing each card.
- Do not change what the server reports; this is presentation and priority only.
- #0950 and #0951 edit views and style.css; keep style.css edits small and merge main often.
- Run every test touching the drawer in small groups, then `repoos check --changed main`.

## Where the removed detail goes
Nothing that is removed from the top line or from the cards above the tabs may become unreachable. Add a new sub-tab in the Debug tab (for example "Status details" or "Why is this task here?") that lists every status and issue card and chip that used to appear above the tabs: the review-failed / no-report detail, the not-landable checklist, handoff and remote-validation failures, checks running/progress, retries exhausted, the TL;DR what-happened text, and the full canned guidance paragraphs. The info popovers in the panel can link to it. Acceptance: that Debug sub-tab shows all of those states with their full text and actions' hints, driven by the same status data, and has a test and a shot.

## Shots
```json
[
{
"label": "Task drawer with compact status and Debug details",
"target": "default",
"route": "/work?task=0952&tab=debug",
"highlight": ".drawer-status-chip",
"state": "drawer:reviewWithBranch"
},
{
"label": "Status details subtab",
"target": "default",
"route": "/work?task=0952&tab=debug",
"highlight": ".debug-tabs",
"steps": [
  {
    "click": ".drawer-status-chip"
  },
  {
    "waitMs": 200
  }
],
"state": "closeOut:checkProgress"
}
]
```

## Screenshots

![25](/api/tasks/0952/attachments/att_2aafd889-22f6-440a-afec-6e552e0a61e9.webp)
![26](/api/tasks/0952/attachments/att_15b67ed1-6e21-43de-9c1d-e56fdf5f128c.png)
![27](/api/tasks/0952/attachments/att_9bdca9d7-c3e7-4069-b6b5-8036d1557a50.png)
![28](/api/tasks/0952/attachments/att_e49a8f74-06ef-4c87-89b7-1b48f575b282.png)
![29](/api/tasks/0952/attachments/att_96536d88-947b-4b2c-9279-a82ee2310531.png)
![30](/api/tasks/0952/attachments/att_01cb47fc-4b2c-4d27-930f-33a45bbb86f7.png)
![31](/api/tasks/0952/attachments/att_c40fe1bc-06ea-4813-86b2-73c9f40fb982.png)

## Activity

- 2026-10-24T23:16:59Z · created · njachowski@gmail.com
- 2026-10-24T23:17:06Z · screenshots
- 2026-10-24T23:17:33Z · body: Where the removed detail goes (added)
- 2026-10-24T23:17:55Z · status inbox→ready
- 2026-10-24T23:18:01Z · cli_override, model_override
- 2026-10-24T23:18:02Z · status ready→active, branch
- 2026-10-24T23:19:29Z · body
- 2026-10-24T23:22:27Z · body
