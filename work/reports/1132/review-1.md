---
task: "1132"
pass: 1
at: "2026-11-15T18:05:03.341Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/allowlist-groups-projects-that-opt-into-
state: ok
tree_identity: "f830258cb:5e8edc194"
---
## Verdict
`needs some work` — grouped mode breaks after a real config reload because `budget.allowlistGroup` never reaches the browser or CLI via `GET /api/config`.

## Relevance
`still relevant` — Solves the 15 Nov multi-repo allowlist drift problem; nothing else on `main` replaces it.

## Evidence
None

## Bugs
None found

Wait - I need to fix the Bugs section - there IS a bug. Let me rewrite:

## Bugs
- **Class: browser config contract** — `safeConfigForBrowser` in `src/server/routes/config.ts` flattens `budget.allowlist` but not `budget.allowlistGroup`, so joined projects never see the group in `GET /api/config` / post-`config.load()` responses. `BudgetControlsPanel.vue` (`configuredGroupName`, `inGroup`, `onMounted` → `refreshGroup`) treats grouped repos as project-only; `saveGroupName` calls `config.load()` and drops group UI. `runAllowlistPauseResume` in `control-api.ts` reads the same flat key, so `repoos allowlist pause|resume` updates committed rows instead of the group when `repoos.toml` already declares a group.
No further findings of this class were found after grepping: `safeConfigForBrowser`, `readConfig`/`patchConfig` responses, `BudgetControlsPanel.vue`, `config.ts` store `load`/`setConfigValues`, `control-api.ts` `runAllowlistPauseResume`, `budget-allowlist.test.ts` / `allowlist-groups.test.ts` (no `safeConfigForBrowser` assertion for the new key).

## Edge cases
- Same-machine group adoption relies on `ConfigWatcher` poll (up to ~3s), not `fs.watch` on `~/.config/repoos/allowlist-groups/`.
- Real tailnet propagation is test-faked only; engineer did not verify bee/thinkpad live.

## Suggestions
- Add a `safeConfigForBrowser` flattening test for `budget.allowlistGroup` (mirror `model_routing` tests).
- Optional human tailnet pause/resume smoke after merge.
- Handoff shot is valid for the unjoined callout (`budget-join-group`); transient “server not responding” banner in the PNG looks like preview timing, not a UI defect.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-15T18:03:06.723Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

