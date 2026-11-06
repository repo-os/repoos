---
task: 1041
pass: 11
at: "2026-11-06T20:15:15.207Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/post-merge-task-summary-report-written-b
state: ok
tree_identity: "b0f58a2a6:63f4e7209"
---
Repeated review classes: dispatch/post-release fallback, retry polling, marker/word limits, and lock ordering are fixed; linked-task loading, validation, and rollback still have gaps. A human should look at this recurring failure-path pattern.

## Verdict
needs some work — remaining rollback, validation, fact-loading, and Git-lock races block sign-off.

## Relevance
still relevant — main does not contain this post-merge summary feature.

## Evidence
The capture is stale (tree `63f4e7209`, reviewed HEAD `b0f58a2a6`), uses the old `tab=dev` route, and records four missing-target failures; it shows only a “REPORT” control, not the summary pane. The evidence JSON has no console log to assess.

## Bugs
- **Unsafe lock cleanup** (`src/core/git-maintenance.ts:33-38`): Any `lsof` error is treated as “no holder.” After two minutes, recovery can delete a live Git process’s `index.lock` when `lsof` is missing or fails, risking concurrent Git writes.
- **Rollback can delete an existing report** (`src/server/task-summary.ts`, summary publication block): If reading an existing `summary.md` fails, `originalContent` remains `null`; either write/commit failure path then unlinks the prior report instead of restoring it.
- **TL;DR check accepts a preamble** (`src/core/task-summary.ts:79-104`): The validator skips fenced blocks before checking the first visible line, so a fenced preamble before `## TL;DR` passes despite the required opening.
- **Linked-task read errors are hidden** (`src/server/task-summary.ts`, `loadCandidateTasksFromDisk`): Per-file read/parse failures are silently skipped, so follow-ups may be omitted without warning the PM.
- **Unknown changes appear as none** (`src/server/task-summary.ts`, `computeChangedFiles`): Missing merge metadata or Git diff errors return an empty list that renders “No changed files,” which can falsely describe the task.

## Edge cases
Round 5’s report source (`c558d0c`) predates this HEAD; no current-round report is present. `merge-tree` found only the task’s own work-file conflict, with no source conflicts.

## Suggestions
Recapture the declared Agent > Report pane on the reviewed tree.

## Automated verification

- Browser console-error check (handoff evidence): **failed** — Handoff browser verification recorded 4 blocking issue(s): [missing-target] Task drawer Dev > Report pane (target "default"): click [data-test-id="engineering-report-tab"]: click: Timeout 5000ms exceeded. on /work?task=1041&tab=dev; [missing-target] Task drawer Dev > Report pane (target "default"): waitFor .engineering-report-view: waitFor: Timeout 5000ms exceeded. on /work?task=1041&tab=dev; [missing-target] Task drawer Dev > Report pane (target "default"): highlight .engineering-report-view matched nothing on /work?task=1041&tab=dev; [missing-target] Task drawer Dev > Report pane (target "default"): selector [data-test-id="engineering-report-tab"] matched nothing on /work?task=1041&tab=dev
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

