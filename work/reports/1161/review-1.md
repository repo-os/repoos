---
task: "1161"
pass: 1
at: "2026-11-18T00:37:09.650Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/easter-eggs-bundle-numeric-enum-settings
state: ok
tree_identity: "6680239ea:"
---
## Verdict
`needs some work` — five numeric enum selects (`heavySlots`, `vitest.maxWorkers`, `localChecks.maxConcurrent`, `playwright.workers`, `playwright.maxConcurrent`) still have the same bug; only four keys were fixed.

## Relevance
`still relevant` — `repoos config set maxConcurrentAgents 4` is broken on main and the patch fixes that path, but the audit criterion remains unmet.

## Evidence
None — no UI change and no shots declared, which is correct for a server + test diff.

## Bugs
- **Class: numeric-enum select normalization** — `src/server/routes/config.ts:728-751` hardcodes four keys, but `getConfigSchema()` has five more selects whose runtime values are numbers: `heavySlots` (`config.ts:3705`), `vitest.maxWorkers` (3719), `localChecks.maxConcurrent` (3733), `playwright.workers` (3747), `playwright.maxConcurrent` (3761). Their options are string-only (`value: String(i + 1)`), while every parser (`src/core/config.ts:2354-2401`) and consumer (`src/core/resource-limits.ts:44-75`) requires a number. Consequences on this branch: (a) `repoos config set heavySlots 3` (CLI sends `Number`, `src/commands/control-api.ts:160`) still returns 400 "must be one of: 1, 2, …, 8" — the exact reported bug; (b) the Settings dropdown submits a string (`SettingsView.vue:1719-1721`), which passes validation, but `serializeTomlVal` (`config.ts:5071`) writes `heavySlots = "3"`, which `loadConfig` silently discards, so the user's change is lost with no error. The report's claim that these "intentionally use string config values" is contradicted by the parser, the `RepoOSConfig` types (`src/types`/`core/types.ts`, `heavySlots?: number`) and `user-docs/configuration.md:1035`. Fix the class by deriving numeric enums from one shared set (or from the existing numeric-key list) and add these keys to the table-driven test.
No further findings of this class were found after grepping: `patchConfig` select/number/array branches, `closeOut.timeoutMs` dedicated branch, `parseSetValue`, `SettingsView.valueForSave`/`buildBody`, `loadConfig` numeric select parsers, `resource-limits.ts`, `SUPPORTED_TOML_KEYS`, `user-docs/configuration.md`.

## Edge cases
- `numericSelect` correctly rejects booleans/arrays via the added type guard; `"4.0"` and `NaN` still 400, which is acceptable.
- `closeOut.timeoutMs` is already handled by its own branch and needs no change.
- The new test asserts TOML text only; a nested unrelated `maxConcurrent = 3` could satisfy the substring.

## Suggestions
- Replace the two duplicated key lists with one shared constant so validation and persistence cannot drift.
- Assert `loadConfig(root).maxConcurrentAgents === 4` instead of (or in addition to) the raw substring check.
- Extend `numericEnums` with the five sibling keys once they are fixed.
- Consider a unit assertion for the CLI path (`parseSetValue("4")` → number) so criterion 1 is exercised directly.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

