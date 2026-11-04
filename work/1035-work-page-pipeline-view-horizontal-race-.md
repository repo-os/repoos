---
id: 1035
title: "Work page: Pipeline view (horizontal race track for active and review tasks)"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/work-page-pipeline-view-horizontal-race-
model_override: opencode-go/muse-spark-1.3-contributor
created_at: "2026-11-04T17:20:01Z"
updated_at: "2026-11-04T18:35:55Z"
---
## Problem

The Work page board is the only way to see tasks in `active` and `review`, and those are where most of the action is: coding, running checks, confirming handoff, in review, merging, stuck, running on this machine or a remote runner. The two-column board plus chips, status text and a full-height action button on every card makes it hard to tell what is happening or how far along a task is. Round counts, models and where a task runs are buried in the task panel, so the user has to open each task to find out.

## Desired UX

Add a second view of the Work page called **Pipeline**, switched with a `Pipeline | Board` toggle styled like the List / Board toggle on the Inputs page (see the attached screenshot). Board stays the default and is unchanged. Remember the last choice per user.

Pipeline shows every task in `active` or `review`, plus tasks that finished recently, as a horizontal race track:

- One **lane per task**, 96px pitch. Stage columns run left to right: Coding, Checks, Handoff, Review, Close-out, Merged. The Merged column is a tinted full-height area (the goal) and recently merged tasks sit in it, then drop out after a short window (start with 10 minutes, make it a constant).
- A task's card sits in the column of its **current stage**, so it can move backwards (review sends it back to Coding). Position is a discrete stage, never a fake progress percentage.
- **Stuck, needs-input, paused and held are states, not stages.** The card stays in the stage where it stalled and carries a danger chip ("Stuck: needs input"). Held/paused tasks are dimmed.
- When a task has been sent back, show a small amber note on its lane ("sent back once") and an amber `R<n> ↻` chip.
- Lighter guides so position is readable: a very faint vertical hairline between stage columns and a very faint horizontal hairline between lanes (about 7% opacity, from theme tokens, not hard-coded). The cards sit centered in their lanes. No lane backgrounds or boxes.
- Click a card to open the existing task panel (same behaviour as a board card). The action (pause, resume, or a check mark once merged) is a small icon button on the card, keyboard focusable, and does not open the panel.
- Order lanes by priority, then time in flight (decide while building and note it). Tasks in `ready` are not shown as lanes; show a small queue count at the left edge if cheap.

### Card: four lines, about 250px wide, about 84px tall

1. Task id, type chip, priority chip, and the action icon on the right.
2. Title, one line, truncated.
3. Status dot and the live step in words ("Coding", "Running checks 3/5", "Confirming handoff", "In review", "Merging"), with time in this state on the right. Stuck / merged use a coloured chip.
4. Engineer round chip (`E2`), reviewer round chip (`R1 changes`, `R2 ↻`, `R1 ✓`), model(s), and where it runs on the right (`this Mac` or the remote host name).

Area chips and the file-count chip are left off to hold four lines. Build the card as separate rows so it can later drop to three lines (fold line 4 into line 3, or move it into a hover/popover) without a rewrite; keep that as a later option, not part of this task.



## Acceptance criteria

1. Test: a view-model function maps a task (status, handoff state, check state, review state, stuck/held flags) to a stage column and to the four card lines. Cover every stage, a task sent back from review to coding, stuck, held and merged.
2. Test: rounds, models and host appear on the card from the same data the task panel uses (no second source of truth).
3. Test: clicking the card opens the task panel; the action icon does not open it, and is reachable by keyboard.
4. Test: the Board | Pipeline toggle switches views and the choice persists; Board is unchanged.
5. Live updates: stage changes arrive through the existing board SSE/state path and move the card without a reload.
6. No bespoke colours; `hardcoded-colors` guard and contrast audit pass in light and dark, including the stuck and sent-back chips on the card surface.
7. Follows AGENTS.md conventions: styled toggle (existing component, not a native select), no native `title` tooltips, full-width page root with `--page-bottom-inset`, shared `style.css` helpers where they exist.
8. Declared `## Shots`: Pipeline view with several lanes (use `state` fixtures, not click steps) in the app target.
9. Docs: add a short section to `user-docs/` describing the Pipeline view and what each stage means.

## Notes for AI

- Work page is `src/ui-app/src/views/WorkView.vue` (route `/work` in `src/ui-app/src/router.ts`). The Inputs page toggle (`InputsView.vue`) is the pattern to copy for the List / Board switch.
- `src/core/active-task-card.ts` already derives the active-card state (needs-input, check-wait, handoff). Extend or reuse it for the stage and step mapping instead of re-deriving it in the component.
- Stage mapping is the main design risk: Coding = active with an engineer running; Checks = self-check / local check in progress or queued; Handoff = handoff requested and being confirmed; Review = `review` with a reviewer running or awaiting sign-off; Close-out = Move to done running; Merged = recently done. Write the mapping down in `docs/` next to the close-out pipeline doc and note the cases that are ambiguous.
- Expected size is 3-5 tasks in flight at a time. Do not over-engineer for dozens, but do not break with 12 (lanes just stack and the page scrolls).
- Keep Board code untouched where possible. This is a new view over the same data.
- Not in scope: dragging cards, a hover popover with extra detail, the three-line variant, showing `ready` tasks as lanes.

## Visual reference
Approved mockup (light and dark, solid hairline guides, cards centered in their lanes) is attached above under Screenshots (third image). Colours: card is one step above the page surface in both themes, chips use the page's chip surface, success tint for Merged, amber for sent-back, red for stuck. Use existing theme tokens only.

## Shots
```json
[
{
"label": "Pipeline view with lanes across every stage",
"target": "default",
"route": "/work",
"highlight": "[data-test-id=\"pipeline-view\"]",
"state": "board:pipeline"
}
]
```

## Screenshots

![1](/api/tasks/1035/attachments/att_de823a65-bd9c-48c2-845b-fbd197b59ece.png)
![2](/api/tasks/1035/attachments/att_4ea308fd-fe8e-43f3-9f15-fee13a945e69.webp)
![Approved Pipeline view mockup, light and dark](/api/tasks/1035/attachments/att_11dd76d3-db5c-4cb5-a3de-9376193d9be7.png)

## Activity

- 2026-11-04T17:20:01Z · created · njachowski@gmail.com
- 2026-11-04T17:20:02Z · screenshots
- 2026-11-04T17:22:46Z · screenshots
- 2026-11-04T17:31:45Z · body: Visual reference (added)
- 2026-11-04T17:31:58Z · body: Desired UX (removed 2)
- 2026-11-04T17:31:59Z · body: Visual reference (added 1, removed 1)
- 2026-11-04T17:44:39Z · model_override
- 2026-11-04T17:44:42Z · status inbox→ready
- 2026-11-04T18:02:21Z · status ready→active, branch
- 2026-11-04T18:07:56Z · body
- 2026-11-04T18:14:29Z · message_queued at 2026-11-04T18:14:29.799Z
- 2026-11-04T18:14:29Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T18:16:30Z · body
- 2026-11-04T18:18:36Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T18:32:07Z · note: adopted orphaned engineer pid 96321
- 2026-11-04T18:35:55Z · CTO nudge: held — an undelivered message is already queued
