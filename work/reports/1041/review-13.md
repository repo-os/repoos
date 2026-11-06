---
task: 1041
pass: 13
at: "2026-11-06T21:26:26.961Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/post-merge-task-summary-report-written-b
state: ok
tree_identity: "eae7688b5:63f4e7209"
---
Repeated review classes: dispatch/post-release fallback, lock ordering and rollback, changed-file errors, marker/word limits, linked-task loading, and section validation are fixed; retry polling is only partly fixed, and status-I/O failures still disappear into idle. A human should look at this recurring failure-path pattern.

## Verdict
needs some work — retries can report success while still running, and status-I/O failures can hide failures.

## Relevance
still relevant — main does not contain this post-merge PM summary feature.

## Evidence
None

## Bugs
- **Stale retry polling** (`src/core/task-summary.ts:42-65`, `src/server/task-summary.ts:183-196`, `src/commands/control-api.ts:1793-1802`, `TaskDrawer.vue:4391-4400`): A retry sets status to `pending` but leaves the previous `summary.md` in place. After ten minutes, the shared status helper treats that old file as proof the retry completed. The CLI can exit successfully and the drawer stops polling while the PM is still running.
- **Summary status I/O errors are hidden** (`src/server/task-summary.ts:162-177, 211-234, 315-323`): Status reads fall back to `idle`, status-write failures only log, and report-read failures become `null`. A failed run whose status cannot be persisted or read is therefore absent from the API/UI rather than visibly failed and retryable.

## Edge cases
The engineering report is still round 5 from `c558d0c`, predating this HEAD; no current-round report is present. The merge conflict is limited to the task’s own file, which close-out resolves from main.

## Suggestions
Recapture the declared Agent > Report pane on the final tree: the available image is stale and the `tab=dev` capture failed all four target assertions; the evidence JSON has no console log.

## Automated verification

- Browser console-error check (handoff evidence): **failed** — Handoff browser verification recorded 4 blocking issue(s): [missing-target] Task drawer Dev > Report pane (target "default"): click [data-test-id="engineering-report-tab"]: click: Timeout 5000ms exceeded. on /work?task=1041&tab=dev; [missing-target] Task drawer Dev > Report pane (target "default"): waitFor .engineering-report-view: waitFor: Timeout 5000ms exceeded. on /work?task=1041&tab=dev; [missing-target] Task drawer Dev > Report pane (target "default"): highlight .engineering-report-view matched nothing on /work?task=1041&tab=dev; [missing-target] Task drawer Dev > Report pane (target "default"): selector [data-test-id="engineering-report-tab"] matched nothing on /work?task=1041&tab=dev
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

