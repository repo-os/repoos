---
task: 1041
pass: 10
at: "2026-11-06T19:31:38.416Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/post-merge-task-summary-report-written-b
state: ok
tree_identity: "633a311ae:63f4e7209"
---
Repeated review classes: dispatch/fallback, linked-task discovery, marker/word-limit handling, lock ordering, and drawer polling are fixed; publication rollback, session-fact loss, and section validation remain incomplete, while retry polling regressed. A human should inspect the recurring failure-path pattern.

## Relevance
still relevant — main has no post-merge summary report feature; its existing task-usage summary is distinct.

## Evidence
The only capture is stale (tree `63f4e7209`) and shows Review, not the declared Dev > Report pane; its selector and click assertions failed. Summary UI is unverified; recapture on the reviewed HEAD.

## Bugs
- **Retry-state handling** (`src/commands/control-api.ts:1787-89, 1867-72`): An existing report makes a `pending` retry terminal, so `repoos summary` exits before it finishes. If the report commits but writing `done` status fails, polling ends at `idle`, but the CLI checks only for `done` and reports failure. Both cases need handling.
- **Silent fact-source loss** (`src/core/db.ts:662-64`, `src/server/task-summary.ts:353, 182-88`): An unavailable DB or failed work-directory scan becomes an empty session or linked-task list without a `loadErrors` warning; the PM can mistake unreadable sources for no sessions or follow-ups.
- **Incomplete section validation** (`src/core/task-summary.ts:84-86`): The prefix regex accepts headings inside fenced code and near-matches such as `## Outcomes`; independent checks also allow the sections out of order.
- **Rollback failures swallowed** (`src/server/task-summary.ts:546-77`): Both commit-failure cleanup paths suppress restore/unlink errors. If cleanup fails, `summary.md` can remain dirty in the shared checkout and block a later landing.

## Edge cases
Round-5 engineering report source `c558d0c` predates reviewed HEAD `633a311`; no current-round report supports its claims. Merge-tree found only the task’s own markdown conflict, not source conflicts.

## Suggestions
None found

## Verdict
needs some work — retry polling exits early; fact, section-validation, and rollback failure paths remain incomplete.

## Automated verification

- Browser console-error check (handoff evidence): **failed** — Handoff browser verification recorded 4 blocking issue(s): [missing-target] Task drawer Dev > Report pane (target "default"): click [data-test-id="engineering-report-tab"]: click: Timeout 5000ms exceeded. on /work?task=1041&tab=dev; [missing-target] Task drawer Dev > Report pane (target "default"): waitFor .engineering-report-view: waitFor: Timeout 5000ms exceeded. on /work?task=1041&tab=dev; [missing-target] Task drawer Dev > Report pane (target "default"): highlight .engineering-report-view matched nothing on /work?task=1041&tab=dev; [missing-target] Task drawer Dev > Report pane (target "default"): selector [data-test-id="engineering-report-tab"] matched nothing on /work?task=1041&tab=dev
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

