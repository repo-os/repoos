---
task: "1058"
pass: 9
at: "2026-11-09T05:32:08.199Z"
agent: reviewer
cli: codex
model: gpt-6.1-terra
branch: feat/easter-eggs-bundle-card-activity-recency
state: ok
tree_identity: "e265d56a3:2f40208d4"
---
Repeated review classes: Pipeline timing fallback and stuck-state handling are fixed; the coding fixtures now show running states. Touch gesture handling remains in the shared tooltip despite the owner’s revised scope. A human should look at this recurring pattern.

## Relevance

still relevant — main still appends activity recency to coding cards.

## Evidence

None

## Bugs

- **Timing fallback:** [TaskCard.vue](/Users/nick/code/nick/repoos-worktrees/feat/easter-eggs-bundle-card-activity-recency/src/ui-app/src/components/TaskCard.vue:657) accepts an invalid activity timestamp instead of falling back to `runningSince`; when neither timestamp is usable, its coding, retry and check-status paths provide no elapsed or state-since timing. [PipelineView.vue](/Users/nick/code/nick/repoos-worktrees/feat/easter-eggs-bundle-card-activity-recency/src/ui-app/src/components/PipelineView.vue:79) has the same invalid-timestamp precedence, although Pipeline retains state elapsed inline.
- **Global touch behavior:** [tooltip.ts](/Users/nick/code/nick/repoos-worktrees/feat/easter-eggs-bundle-card-activity-recency/src/ui-app/src/lib/tooltip.ts:77) adds tap and long-press tooltips to every tooltip host, contrary to the owner’s instruction that touch taps behave as before. A pending long-press timer also survives scroll, allowing a tooltip to appear after a touch becomes a scroll. This affects Board and Pipeline triggers and unrelated tooltip hosts.
- **Landing scope:** The server reports conflicts in task files 1060 and 1070 and changes to other tasks’ bookkeeping, including 1061, 1067, 1068 and 1069. Restore unrelated bookkeeping and resolve the conflicts before review.

## Edge cases

The engineering report’s source matches the implementation tree; only task bookkeeping changed afterward. The recorded routes matched and the console had zero errors.

## Suggestions

The Board capture shows a coding line and its popup. The Pipeline capture shows coding but crops out the popup; recapture the full popup for human review.

## Verdict

needs some work — timing fallback, global touch behavior and landing scope need correction.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-09T05:31:04.350Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

