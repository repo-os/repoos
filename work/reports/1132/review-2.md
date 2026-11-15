---
task: "1132"
pass: 2
at: "2026-11-15T18:44:28.881Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/allowlist-groups-projects-that-opt-into-
state: ok
tree_identity: "3e0071221:5e8edc194"
---
## Verdict
`good to go` — pass-1 browser config contract is fixed; groups meet the acceptance bar. `STALE-EVIDENCE-ONLY`

## Relevance
`still relevant` — Multi-repo allowlist drift on 15 Nov is still unsolved on `main`; this is the intended fix.

## Evidence
None

## Bugs
None found
No further findings of this class were found after grepping: `safeConfigForBrowser`, `BudgetControlsPanel.vue` (`configuredGroupName` / `refreshGroup`), `control-api.ts` (`runAllowlistPauseResume`), `loadConfig` group merge, `budget-allowlist-groups.ts` (apply/pause/resync), `allowlist-group-sync.ts` / `propagateAllowlistGroup`, `config-watch.ts`, `budget-allowlist.test.ts`, `allowlist-groups.test.ts`, `config-watch.test.ts`.

## Edge cases
- Pass-1 fix verified: `budget.allowlistGroup` is flattened in `safeConfigForBrowser` (round-2 `3e007122`), with tests; `ConfigWatcher` now signatures the group TOML plus `fs.watch` on its directory.
- Engineering report and UI verification JSON target `5e8edc194`, not reviewed `HEAD` `3e007122`.
- Merge with `main`: only `work/1132-*.md` conflicts; close-out takes `main`’s copy per landing checklist.
- Timed pause expiry is enforcement-time (`pauseIsActive`), not a group-file rewrite; matches existing budget behaviour.
- Tailnet propagation is SSH + authenticated HTTP apply locally; group-B isolation has a test.

## Suggestions
- Re-capture the declared Budget Controls shot on `3e007122` (join callout at `[data-testid="budget-join-group"]`); existing PNG is valid for the unjoined UX but predates round-2.
- Optional human pause/resume smoke across bee/thinkpad after merge.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-15T18:03:06.723Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

