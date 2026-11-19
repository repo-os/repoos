---
task: "1227"
pass: 1
at: "2026-11-19T10:52:10.290Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-user-docs-accuracy-against-the-c
state: ok
tree_identity: "d934da61a:"
---
## Verdict
`good to go` — docs fixes verified against code; the one code change (help banner) is correct and matches the real CLI.

## Relevance
`still relevant` — user-docs did drift from the current agent registry and CLI banner, and this pass fixes the two real inaccuracies plus records the audit trail the spec asked for.

## Evidence
None

## Bugs
None found

I verified the two changes against the source of truth they claim:

- **agents.md registry**: `KNOWN_AGENTS` in `src/core/detect.ts` lists exactly eleven drivable agents, including `crush` (plain-text headless, auto-approval in run mode, `crush models`), `pi` (strict JSONL, session resume, no approval prompts) and `muse` (`muse exec --json`, UUID resume) — the new rows' notes match the `capability` strings verbatim in substance. The engine registry in `src/server/agents.ts` handles all three ids. Count and wording are accurate.
- **help.ts secrets line**: `src/commands/secrets.ts` really implements `action === "bindings"` (GET `/api/project-environment-bindings`), so adding `| bindings` to the usage line is correct, and `user-docs/cli.md` line 529 already documents it — the docs were indeed right, the banner was stale.
- The new `docs/qa/2026-11-user-docs-accuracy-qa.md` is consistent, and the first-pass report it references (`docs/qa/2026-11-user-docs-accuracy.md`) exists.

No findings of this class were found after grepping: `src/cli/help.ts` usage lines, `src/commands/secrets.ts`, `src/core/detect.ts` (`KNOWN_AGENTS`), `src/server/agents.ts` driver dispatch, `user-docs/agents.md`, `user-docs/cli.md`.

## Edge cases
- The QA report's claim that the check gate dispatched tests via the configured `remoteValidation` runner is a config-driven gate behavior, not manual SSH; no runner config was read or changed in the diff (verified: diff touches no runner or `repoos.toml` files).
- Report source commit matches the reviewed tree per the server preflight; no earlier review passes exist (only `round-1.json`), so nothing to re-verify from prior rounds.

## Suggestions
- Same drift class, left unfixed (acknowledged in the QA report): the `repoos --help` banner still omits real flags — `check --fix/--step` and `doctor --yes`. Not stale docs and predates the baseline, so out of this task's scope, but the banner/CLI-reference drift the engineer documented is a recurring class; a small follow-up task to reconcile the banner with per-command `--help` would prevent the next instance.
- `user-docs/agents.md` omits muse's "read-only advisory turns" capability; harmless abbreviation, fine as is.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

