---
task: 1041
pass: 4
at: "2026-11-06T09:19:33.978Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/post-merge-task-summary-report-written-b
state: ok
tree_identity: "02ff52ddd:e20a07587"
---
## Verdict
needs some work — stale close-out facts and a word-limit bypass can produce incomplete or oversized reports.

## Relevance
still relevant — main has no other PM-written post-merge summary implementation.

## Evidence
`auto: matched src/ui-app/**` (`/`, `default-1.png`): stale tree `e20a07587` vs reviewed `02ff52ddd`; it shows a loading skeleton, not the task drawer Report pane. Recapture on the reviewed tree.

## Bugs
- **Close-out freshness race:** `src/server/integration-orchestrator.ts:4376` prefers the live-index task immediately after `markTaskReleased`; the index is not refreshed first. `src/server/task-summary.ts:288-292` then uses that object's status, timestamps, and merged commit, although it rereads only the body. The automatic report can therefore claim the task is still in review, omit the merged commit, and list no changed files.
- **Narrative word-limit bypass:** `src/core/task-summary.ts:42-48` treats any exact generated marker as the cutoff. `src/server/task-summary.ts:394-395` validates the PM output before appending the server marker. If the PM output contains the marker followed by long text, validation ignores that tail, then the server appends its own marker after it; the final report can exceed 2,000 words. The prior lookalike-heading fix does not cover this case.

## Edge cases
The sole engineering report is stale (source `e20a07587`, not reviewed HEAD `02ff52ddd`); no current-round report exists, so its claims are not evidence. Earlier branchless queueing, linked-task disk fallback, and pending-summary polling fixes are present.

## Suggestions
None found

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-06T06:26:43.006Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

