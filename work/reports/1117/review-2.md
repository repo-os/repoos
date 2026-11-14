---
task: "1117"
pass: 2
at: "2026-11-14T15:44:24.583Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/full-check-is-slow-measure-where-the-tim
state: ok
tree_identity: "2e4665a01:"
---
## Verdict
`good to go` — Test-only speedups and watcher retry logic look correct; round-2 report covers AC5 on final HEAD.

## Relevance
`still relevant` — Full-check cost is still dominated by integration files this branch honestly leaves untouched; `agent-contract` savings and profile data are worth landing.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: `src/core/agent-contract.ts`, `src/ui-app/tests/agent-contract.test.ts`, `src/ui-app/tests/git-ref-watcher.test.ts`, `src/ui-app/tests/repo-status-triggers.test.ts`, `REPOOS_AGENT_CONTRACT_CANCEL_PROBE`, `writeUntilObserved`, `mutateUntilSignaled`, `helpers.ts` `waitFor`.

## Edge cases
- AC4: remote test phase −21.3% (below 25% aim) with rationale; six named heavy files mostly flat — expected given scope.
- Round-2 `sourceSha` `2e4665a` matches reviewed HEAD; round-1 AC5 gap addressed in committed round-2 narrative (not re-verified here per gate).
- `git-ref-watcher` `it.each` timeout now 60s (was 3s on nested waits): failures surface slower, not weaker assertions.
- Landing checklist: task-file merge WARN only; review-lock WARN until this verdict is recorded (server facts).

## Suggestions
- File or land follow-up for `dev-targets` / `remote-host-pool` (#1118) using the reported baselines.
- Optional: share one helper between the two near-identical retry loops in watcher tests.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

