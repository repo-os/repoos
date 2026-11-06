---
task: 1041
pass: 12
at: "2026-11-06T20:53:44.461Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/post-merge-task-summary-report-written-b
state: ok
tree_identity: "f6bb0b114:63f4e7209"
---
Repeated review classes: dispatch/post-release fallback, lock ordering and rollback, changed-file error reporting, and marker/word-limit handling are fixed. Retry polling, linked-task fact loading, and section validation remain incomplete; a human should look at this recurring failure-path pattern.

## Relevance
still relevant — main does not contain the post-merge summary feature.

## Evidence
The available capture is stale (tree `63f4e7209`, reviewed HEAD `f6bb0b114`) and uses the old `tab=dev` route instead of the declared `tab=agent`. It shows only the Report control; all four target assertions failed, and the evidence JSON has no console log. Recapture the Agent > Report pane on the reviewed tree.

## Bugs
- **Pending-state polling after a lost completion write** (`src/server/task-summary.ts:660-662`, `src/commands/control-api.ts:1793-1796`, `src/ui-app/src/components/TaskDrawer.vue:4376-4380`): If `done` status persistence fails after `pending` was saved and the report committed, status stays `pending`. CLI polling treats an existing report as nonterminal in that state and times out; the drawer keeps showing “writing” and eventually stops polling.
- **Linked-task fact loss** (`src/server/task-summary.ts:409-410, 687-689`; `src/core/task-summary.ts:184-190, 287`): The automatic queue discards `loadErrors` from its disk scan, then passes the nonempty task list to fact collection, which skips rescanning. Also, linked-task facts include titles but omit task bodies and creation dates, so the PM cannot reliably identify newly spawned follow-ups or explain their reasons.
- **Section validation accepts commented-out headings** (`src/core/task-summary.ts:75-92, 118-125`): Fenced code is skipped, but HTML comments are not. Required headings inside a multiline comment pass validation while being hidden in the rendered report.

## Edge cases
The latest engineering report is round 5 from `c558d0c`, predating this HEAD; no current-round report is present. The supplied landing checklist reports only the task’s own work file conflicts with main, which close-out resolves from main.

## Suggestions
None found

## Verdict
needs some work — polling, linked-task facts, and section validation still violate acceptance.

## Automated verification

- Browser console-error check (handoff evidence): **failed** — Handoff browser verification recorded 4 blocking issue(s): [missing-target] Task drawer Dev > Report pane (target "default"): click [data-test-id="engineering-report-tab"]: click: Timeout 5000ms exceeded. on /work?task=1041&tab=dev; [missing-target] Task drawer Dev > Report pane (target "default"): waitFor .engineering-report-view: waitFor: Timeout 5000ms exceeded. on /work?task=1041&tab=dev; [missing-target] Task drawer Dev > Report pane (target "default"): highlight .engineering-report-view matched nothing on /work?task=1041&tab=dev; [missing-target] Task drawer Dev > Report pane (target "default"): selector [data-test-id="engineering-report-tab"] matched nothing on /work?task=1041&tab=dev
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

