---
task: "1058"
pass: 5
at: "2026-11-08T19:29:49.683Z"
agent: reviewer
cli: codex
model: gpt-6.1-terra
branch: feat/easter-eggs-bundle-card-activity-recency
state: ok
tree_identity: "eae9b728a:35da0544a"
---
## Relevance

still relevant — Healthy cards on main still show noisy activity recency.

## Evidence

None

## Bugs

- **Missing recency on running-state paths:** [TaskCard.vue](/Users/nick/code/nick/repoos-worktrees/feat/easter-eggs-bundle-card-activity-recency/src/ui-app/src/components/TaskCard.vue:1189) omits the activity tip for checks and confirming-handoff lifecycle states; the check-progress display bypasses the hint entirely. [PipelineCard.vue](/Users/nick/code/nick/repoos-worktrees/feat/easter-eggs-bundle-card-activity-recency/src/ui-app/src/components/PipelineCard.vue:150) likewise hides elapsed time during check progress but attaches no tip to that display. Users cannot retrieve the requested timing from those status lines.
- **Wrong timing source:** [PipelineCard.vue](/Users/nick/code/nick/repoos-worktrees/feat/easter-eggs-bundle-card-activity-recency/src/ui-app/src/components/PipelineCard.vue:78) presents `stateSince` as the replacement timing, but [PipelineView.vue](/Users/nick/code/nick/repoos-worktrees/feat/easter-eggs-bundle-card-activity-recency/src/ui-app/src/components/PipelineView.vue:246) supplies `task.updated_at`, not the agent’s last activity. A long-running task with recent output can therefore show an old timestamp instead of its last-activity time.

## Edge cases

The recorded board and pipeline captures match their routes and show the intended coding presentation; no console errors were recorded. The reviewed implementation matches the engineering report’s source apart from task bookkeeping. The server reports only the task-file merge conflict, which close-out handles.

## Suggestions

Add coverage for recency on check-progress and confirming-handoff states, and for a pipeline task whose last activity differs from its update time.

## Verdict

needs some work — Running-state popovers omit or misrepresent last-activity timing.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-08T19:29:01.889Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

