---
task: "1289"
pass: 1
at: "2026-11-25T08:44:53.705Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/qa-pass-hub-pull-to-refresh-and-parallel
state: ok
tree_identity: "62dcc09fc:"
---
## Verdict

`good to go` — Test-only QA pass; new assertions match component and scheduler contracts; engineering round-1 satisfies the report criterion.

## Relevance

`still relevant` — #1286 and #1275 still benefit from targeted automated coverage this branch adds without duplicating work already on `main`.

## Evidence

None

## Bugs

None found

No further findings of this class were found after grepping: `src/ui-app/tests/mobile-reachability-refresh.test.ts`, `src/ui-app/tests/mobile-server-list.test.ts`, `src/server/__tests__/close-out-scheduler.test.ts`, `mobile/src/components/ServerListView.vue`, `mobile/src/reachability.ts`, diff-only `node`/`npm`/`npx` patterns.

## Edge cases

- Pull-to-refresh tests use synthetic `TouchEvent`s in jsdom; they do not prove Capacitor WebView scroll arbitration, inertia, or `touchcancel` (called out in engineering round-1).
- Reachability timeout test uses `timeoutMs: 5` so the user string reads “0 seconds”; it still exercises abort handling, not real network latency.
- Scheduler lock wait is a gated promise, not a real publication lock or process crash; crash recovery, parked publishers, and ordering remain covered by pre-existing `close-out-scheduler.test.ts`, `close-out-scheduler-crash.test.ts`, and `close-out-parallel.test.ts` (not modified here).
- Engineering report `sourceSha` predates HEAD `62dcc09` by bookkeeping-only commits; test hunks match the diff under review.

## Suggestions

None

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

