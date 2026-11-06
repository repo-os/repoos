---
task: 1041
pass: 7
at: "2026-11-06T13:41:28.434Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/post-merge-task-summary-report-written-b
state: ok
tree_identity: "433b3482b:40eeb7841"
---
## Verdict
needs some work — failed commits can leave main dirty and expose an uncommitted report as ready.

## Relevance
still relevant — main has no other post-merge summary implementation.

## Evidence
The current, nonblank capture shows the Control page at `/`, not the task drawer’s Dev > Report pane; zero console errors were recorded.

## Bugs
- **Publication and failure handling** (`src/server/task-summary.ts:477-503`, `src/commands/control-api.ts:1868`, `src/ui-app/src/components/TaskDrawer.vue:6408-6428`): `summary.md` is written into the shared checkout before the publication lock is acquired. If lock acquisition or commit fails, it remains uncommitted and dirty; report paths block close-out (`src/core/git.ts:2641-2643`). The API still reports it as existing, the CLI can say it is ready despite `status: failed`, and the drawer renders it.
- **Silent fact-source loss** (`src/server/task-summary.ts:302-325`): engineering-report load errors are discarded, session-query failures become an empty list (“No sessions recorded”), and unreadable review bodies become empty. The PM can therefore produce an incomplete or misleading report instead of surfacing unavailable recorded facts.
- **Required-section validation** (`src/core/task-summary.ts:71-81`): validation checks only the TL;DR prefix and word limit. Output omitting Outcome, Process stats, What went wrong, Learnings, or Follow-ups still gets committed despite the prompt requiring those sections.

## Edge cases
None found

## Suggestions
Capture the task drawer’s Dev > Report pane with a generated summary; the handoff shot does not verify that UI.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-06T13:36:23.336Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

