---
task: "1117"
pass: 1
at: "2026-11-14T15:09:33.300Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/full-check-is-slow-measure-where-the-tim
state: ok
tree_identity: "a9775a957:"
---
## Verdict
`needs some work` — Production code is sound, but acceptance criterion 5 (two consecutive full-suite greens on the final tree) is not met.

## Relevance
`still relevant` — Fixture idle time and watcher-setup races are real contributors; the profile report is useful even though the six heaviest files barely moved.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: `src/core/agent-contract.ts`, `src/ui-app/tests/agent-contract.test.ts`, `src/ui-app/tests/git-ref-watcher.test.ts`, all `REPOOS_AGENT_CONTRACT_CANCEL_PROBE` references, shared `waitFor` in `helpers.ts`.

## Edge cases
- AC5: the engineer states two consecutive `bun run test` passes predated the pressure-guard revert; final-tree attempts hit unrelated timeouts and a third run stopped before the summary — only scoped `repoos check` on final HEAD is proven.
- AC4: remote test phase −21.3% is documented below the 25% target; six named files are mostly flat (dominant cost unchanged).
- Git watcher: 50 ms setup sleep may still lose events on an extremely loaded worker; `waitFor` now uses the 60 s default (was 3 s), so hangs take longer to surface.
- Report `sourceSha` `300ff99` matches implementation commits; `a9775a9` adds only task/report bookkeeping.

## Suggestions
- Before sign-off, run two consecutive full suites on `a9775a9` (or accept AC5 deferral explicitly in the task).
- Track follow-up work on `dev-targets` and `remote-host-pool`, which dominate wall time.
- Server landing checklist: merge WARN on task markdown only; overall not landable until review verdict lands (expected).

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

