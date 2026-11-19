---
task: "1227"
pass: 6
at: "2026-11-19T13:24:28.184Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-user-docs-accuracy-against-the-c
state: ok
tree_identity: "ffed8cd0d:"
---
Repeated review classes: Passes 1–3 kept finding stale `Usage: repoos secrets` copies (banner in `help.ts` and the bad-invocation line omitted `bind`/`bindings`), an untested usage-drift class, and stale agent-CLI counts in `user-docs/agents.md` and `docs/agent-model-recommendations.md`. All are fixed and re-verified on this HEAD: both usage strings now cover all six dispatched actions, a new test pins `SECRETS_USAGE`/banner against `SECRET_ACTIONS`, and both docs say "eleven" matching `KNOWN_AGENTS`. No instance recurred after pass 3; the recurring pattern (hand-maintained usage strings drifting from dispatch logic) is now test-pinned, but a human should still note it as a class for other commands.

## Verdict
`good to go` — docs/CLI fixes verified against the registry and implementation; tree unchanged since pass 5 reviewed it, prior findings all confirmed fixed.

## Relevance
`still relevant` — the user-docs drift was real (eight→eleven agent CLIs, stale secrets usage strings) and the required QA deliverable `docs/qa/2026-11-user-docs-accuracy-qa.md` is committed.

## Evidence
None

## Bugs
None found

Re-verified directly on HEAD (`075f5657e` = pass-5 tree `ffed8cd0d` + report bookkeeping only):

- `KNOWN_AGENTS` (`src/core/detect.ts`) has exactly 11 entries; `user-docs/agents.md` says "eleven" with 11 rows including `crush`/`pi`/`muse`; `docs/agent-model-recommendations.md:24` consistent.
- `SECRETS_USAGE` is the exact string printed at the bad-invocation site; `bind` (PUT `/api/project-environment-bindings`) and `bindings` (GET) really dispatch in `cmdSecrets`; the `help.ts` banner usage line includes `| bindings`; `commandUsage` exists for the test.
- New test imports resolve and pins both usage surfaces to `SECRET_ACTIONS`.
- No bare `node`/`npm`/`npx` in the diff; `repoos.toml` untouched; no ssh/runner changes; QA doc present (176 lines).

No further findings of this class were found after grepping: `src/commands/*.ts` for `Usage: repoos` copies, `src/cli/help.ts` (`GROUPS`/`commandUsage`), `src/core/detect.ts` (`KNOWN_AGENTS`), `src/server/agents.ts` driver dispatch, `user-docs/*.md` and `docs/*.md` for stale agent counts.

## Edge cases
- The attached engineering report is round 1 (commit `a165c61`) and stale; no newer round report exists. Its claims were not treated as evidence — the current tree was verified directly.
- The test's `toContain("bind")` is trivially satisfied by the `bindings` substring; harmless today since both appear verbatim (carried unchanged from earlier passes).
- Server preflight: only conflict is this task's own `work/1227-*.md`, which close-out resolves from main.

## Suggestions (non-blocking)
None found

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

