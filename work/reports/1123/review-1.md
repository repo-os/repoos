---
task: "1123"
pass: 1
at: "2026-11-14T19:46:34.603Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/agents-page-raw-cli-errors-leak-into-the
state: ok
tree_identity: "52da9a498:6ba07cadc"
---
## Verdict

`good to go` — Core classification, read-time formatting, and last-runs filtering match the spec; handoff capture never shows the last-runs block. `EVIDENCE-GAP-ONLY`

## Relevance

`still relevant` — #1098 left generic CLI blobs on the Agents page and the listed production strings still needed new classes and list hygiene.

## Evidence

- `default-1.png`: route `/agents?tab=default` matched, zero console errors, not blank — but no last-runs rows, toggle, or classified failure copy (likely empty/filtered preview sessions).

## Bugs

None found

No further findings of this class were found after grepping: `src/core/agent-failure.ts`, `src/core/agent-last-runs.ts`, `src/server/server.ts` (`GET /api/agents/last-runs`), `src/server/agents.ts`, `src/server/engineer-crash-recovery.ts`, `src/ui-app/src/views/AgentsView.vue`, `TaskCard.vue`, `TaskDrawer.vue`.

## Edge cases

Pre-formatted `errorReason` rows (if any) would be re-wrapped by `formatAgentFailure` at read time; sessions store raw CLI text today. Invalid `at` timestamps filter as hidden. AC 5’s “view hiding” is covered via `filterAgentLastRuns` unit tests only, not a mounted `AgentsView` test.

## Suggestions

Re-capture with fixture sessions so the shot shows plain-language failure rows plus **Show older and other runs (N)**. Optional: cache `lastRunFailureParts(run.reason)` in the `v-for` to avoid triple `splitAgentFailureDetail`. Engineering report base `6ba07cad` vs reviewed `52da9a4` differs only in bookkeeping (expected).

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-14T19:45:25.601Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

