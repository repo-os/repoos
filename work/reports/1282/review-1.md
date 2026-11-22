---
task: "1282"
pass: 1
at: "2026-11-22T16:55:28.893Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/task-drawer-collapse-the-depends-on-type
state: ok
tree_identity: "9320192d5:b3d41c50d6"
---
## Verdict

`needs some work` — collapsed summary omits assignee when stories are disabled, so the one-line preview is incomplete vs the modal.

## Relevance

`still relevant` — The drawer metadata block still wastes vertical space; collapsing it behind a modal matches how humans use these fields.

## Evidence

None

## Bugs

- **Class: Summary field coverage** — `TaskDrawer.vue` `metaSummary` only appends story when `storiesEnabled` is true and never includes `draft.assignedTo`, so with stories off the summary shows type, priority, area, and dependencies only while the modal still edits Assigned to (`task-drawer-story-select.test.ts` covers the modal path but not the summary text).

No further findings of this class were found after grepping: `metaSummary` and other drawer summary builders, `storiesEnabled` branches in `TaskDrawer.vue`, and the responsive, story-select, and browser tests for assignee-in-summary assertions.

## Edge cases

- Prerequisite `dep-row` chips (blocker state, click-through) are gone from Details; only ids in the summary and chip titles in the modal remain—the engineer flagged this as an intentional trade-off for the two-line cap.
- Many dependencies compress into two clamped lines; ids may truncate.
- `Done` closes the modal without saving; Save bar behavior is unchanged.

## Suggestions

- Add `assignedTo` to the summary when stories are disabled (e.g. `unassigned` / `human` / `ai`), with a test mirroring the story-enabled summary case.
- Confirm dropping inline blocker-state affordances on Details is acceptable for humans who depended on them.
- Handoff captures look correct: collapsed one-line summary on fixture #9999, modal with Depends on `None`, chips, and all fields; zero console errors; `drawer:taskDetailsSummary` fixture and route match.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-22T16:54:20.978Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

