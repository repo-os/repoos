---
task: 1041
pass: 9
at: "2026-11-06T18:55:15.337Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/post-merge-task-summary-report-written-b
state: ok
tree_identity: "5f1d413c2:5f1d413c2"
---
Repeated review classes: dispatch/fallback coverage, linked-task facts, marker/word-limit handling, lock ordering, and drawer polling are fixed; fact-source loss, publication rollback, retry-state handling, and section validation remain. A human should look at this recurring pattern.

## Relevance
still relevant — `main` contains no post-merge summary implementation.

## Evidence
The nonblank capture reached `/work`, but its recorded highlight matched nothing; it does not verify the Dev > Report pane or the summary UI.

## Bugs
- **Publication rollback** (`src/server/task-summary.ts:529-550`): on a failed commit, the new file is left uncommitted; on a thrown commit error, cleanup unlinks `summary.md`. Retrying can therefore leave a dirty checkout or delete a previously committed report. Preserve and restore the prior file on every failed publication path.
- **Retry-state handling** (`src/commands/control-api.ts:1827,1867-1873`): `exists` makes an old report terminal even while a retry is `pending`, and `cmdSummary` only treats `done` as success. A pending retry can report failure early; `--json` returns exit 0 even for pending or failed states. If the `done` status write fails, the committed report is likewise reported as failure. Failed status writes also leave the UI at `idle` (`src/server/task-summary.ts:129-147`; `TaskDrawer.vue:4383-4387`), hiding the failure.
- **Silent session-fact loss** (`src/core/db.ts:662-670`, `src/server/task-summary.ts:351-356`): `getTaskSessions` converts unavailable DB/query errors to `[]`, so the caller’s catch cannot add a load error; the PM may report “No sessions recorded” despite missing data.
- **Section validation** (`src/core/task-summary.ts:84-86`): `includes()` accepts section-title text inside prose or code blocks, so a report without the required headings can pass.

## Edge cases
Round 5’s engineering report is stale (source `c558d0c`, not reviewed HEAD `5f1d413`); no current-round report is present.

## Suggestions
None found

## Verdict
needs some work — publication failures, retry state, silent session loss, and weak section checks still violate requirements.

## Automated verification

- Browser console-error check (handoff evidence): **failed** — Handoff browser verification recorded 1 blocking issue(s): [missing-target] Task drawer Dev > Report pane (target "default"): highlight [data-test-id="report-tab-content"] matched nothing on /work?task=1041&tab=dev
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

