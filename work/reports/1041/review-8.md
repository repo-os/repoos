---
task: 1041
pass: 8
at: "2026-11-06T17:07:27.307Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/post-merge-task-summary-report-written-b
state: ok
tree_identity: "d8d958548:c558d0c04"
---
Repeated review classes: lifecycle/fallback dispatch is mostly fixed but still has a post-release failure gap; fact-source loss and publication rollback remain; required-section and word-limit validation, lock ordering, and drawer polling are fixed. The recurring pattern is incomplete handling of secondary failures; a human should review it.

## Relevance
still relevant — `main` has no post-merge summary implementation.

## Evidence
The nonblank `auto: matched src/ui-app/**` capture shows the Control dashboard at `/`, not the task drawer’s Dev > Report pane; it has no assertions and does not verify the UI acceptance criterion.

## Bugs
- **Fact-source loss** (`src/server/task-summary.ts:266-340`): `loadEngineeringReports()` returns per-file errors, but only `.reports` is used. `listReviewPasses()` skips unreadable passes, `readReviewBody()` converts read failures to empty text, and task-body read failures silently fall back. These can produce summaries missing recorded facts without the load errors promised to the PM.
- **Publication rollback** (`src/server/task-summary.ts`, summary write/commit block): when regenerating an existing report, a `false` commit result unlinks `summary.md`, deleting the previous report and leaving a dirty deletion. A thrown write/commit error bypasses that cleanup, potentially leaving an uncommitted file.
- **Retry state masking** (`src/commands/control-api.ts`): any existing report makes polling terminal, and the CLI treats `exists` as success. Retrying with an older report already present can return success immediately while the new generation is pending—or report success after it fails.
- **Post-release queue gap** (`src/server/integration-orchestrator.ts`): `releasedOk` is set only after the optional dirty-worktree `patchTaskFile`. If that patch fails after `markTaskReleased` succeeds, the task is done but summary queueing is skipped.

## Edge cases
None found

## Suggestions
Recapture the task drawer’s Dev > Report pane on the reviewed tree.

## Verdict
needs some work — fact-source loss, retry reporting, publication rollback, and a post-release queue gap remain.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-06T16:47:40.705Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

