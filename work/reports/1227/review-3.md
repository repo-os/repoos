---
task: "1227"
pass: 3
at: "2026-11-19T11:57:32.247Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-user-docs-accuracy-against-the-c
state: ok
tree_identity: "ffed8cd0d:"
---
## Verdict
`good to go` — the review-fix round verified clean; docs changes are accurate and the new usage-string test pins the drift class.

## Relevance
`still relevant` — the user-docs drift was real, both fixes plus the pass-2 suggestions (self-usage line, `docs/agent-model-recommendations.md` count) now land together.

## Evidence
None

## Bugs
None found

Verification of the new round (commits 255b18eab/ffed8cd0d, after pass 2):

- **`SECRETS_USAGE` constant** (`src/commands/secrets.ts:5`): now includes `bind <consumer> …` and `bindings`, matching what `cmdSecrets` actually dispatches (`bindings` → GET `/api/project-environment-bindings`, `bind` → PUT; lines 58–98). It is the exact string printed at the bad-invocation site (line 100); no other stale copy remains in the file.
- **New test** (`src/commands/secrets.test.ts`): `SECRET_ACTIONS` mirrors the dispatch set exactly; `commandUsage("secrets")` (`src/cli/help.ts:513`) returns the banner entry from `GROUPS`, which contains both `bind` and `bindings`, and `SECRETS_USAGE` contains all six actions — both assertions genuinely exercise the drift class.
- **`docs/agent-model-recommendations.md:24`**: "eight" → "eleven coding-agent CLIs"; `KNOWN_AGENTS` in `src/core/detect.ts` has exactly 11 entries, consistent with the fixed `user-docs/agents.md` table (11 rows).
- **`docs/qa/2026-11-user-docs-accuracy-qa.md`**: its "Review fix round (pass 2)" section accurately describes this diff; the claimed follow-up task #1229 exists on the board (verified read-only in `work/`), so nothing is invented.
- Pass-1 and pass-2 findings re-checked on this HEAD: both fixed items remain fixed; no bare `node`/`npm`/`npx` introduced; no runner config touched; `repoos.toml` untouched. The server preflight already cleared merge/scope; the only conflict is this task's own `work/1227-*.md`, which close-out resolves from main.

No further findings of this class were found after grepping: `src/commands/secrets.ts`, `src/commands/secrets.test.ts`, `src/cli/help.ts` (`GROUPS`/`commandUsage`), other `Usage: repoos` strings across `src/commands/*.ts`, `src/core/detect.ts` (`KNOWN_AGENTS`), `src/server/agents.ts` driver dispatch, `user-docs/*.md` and `docs/*.md` for stale "eight" counts.

## Edge cases
- **Missing current-round engineering report**: the attached report is round 1 (source commit `a165c61`), stale relative to the two newer commits. The QA doc's "Review fix round (pass 2)" section describes the new work, but no round-2 `round-2.json`/report was generated; I did not treat the stale report's claims as evidence and verified the new code directly.
- The test's `toContain("bind")` is trivially satisfied by `bindings`' substring in both strings; a future regression that removes `bind` alone would not be caught. Harmless today — both actions still appear verbatim.
- Remaining same-class usage strings in sibling commands (`docs.ts:133`, `reminder.ts:5`, `checks.ts:134`) predate this task and are out of scope; #1229 covers the banner/`--help` reconciliation.

## Suggestions
None found

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

