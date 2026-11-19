---
task: "1227"
pass: 2
at: "2026-11-19T11:18:49.476Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-user-docs-accuracy-against-the-c
state: ok
tree_identity: "d934da61a:"
---
## Verdict
`good to go` — both fixes verified against code; the docs-only diff plus the one-line help correction is accurate and complete as scoped.

## Relevance
`still relevant` — user-docs genuinely drifted (eight→eleven agent CLIs, stale `secrets` banner), and the QA deliverable the spec required is present and substantive.

## Evidence
None

## Bugs
None found

Verified the two changes against their sources of truth:

- **agents.md table**: `KNOWN_AGENTS` (`src/core/detect.ts`) lists exactly eleven drivable agents; the added `crush`/`pi`/`muse` rows match the `capability` strings and driver code (`src/server/agents.ts` handles all three ids; `muse exec --json`, UUID resume, `crush models` all confirmed in comments/args). Count and wording are accurate.
- **help.ts secrets line**: `src/commands/secrets.ts:51` really implements `action === "bindings"` (GET `/api/project-environment-bindings`), and `user-docs/cli.md:529` already documented it — docs were right, banner was stale. The corrected usage line renders fine.
- `repoos.toml` untouched; no runners, no ssh, no bare `node`/`npm`/`npx` introduced. First-pass QA report referenced by the deliverable exists.
- Pass 1 findings re-verified: registry count, help line, and QA-report consistency all hold on this HEAD; nothing new to fix.

No further findings of this class were found after grepping: `src/cli/help.ts` usage lines, `src/commands/secrets.ts`, `src/core/detect.ts` (`KNOWN_AGENTS`), `src/server/agents.ts` driver dispatch and `museExecArgs`, `user-docs/*.md` for stale counts ("eight CLIs"), `docs/qa/` for the referenced prior pass.

## Edge cases
- The QA report's claim that the check gate dispatched tests through the configured `remoteValidation` runner is the repo's own config-driven gate behavior; the diff reads or changes no runner config, so the "no ssh, no runner changes" constraint is satisfied.
- Report source commit matches the reviewed tree per the server preflight; pass-1 review found `good to go` and its two suggestions were not blocking.

## Suggestions
- Same drift class, one more instance: `src/commands/secrets.ts:94` prints its own usage string omitting both `bind` and `bindings` — same banner/usage-line drift the engineer fixed in `help.ts`, predates this task, out of user-docs scope.
- `docs/agent-model-recommendations.md:24` still says "eight coding-agent CLIs" — outside `user-docs/` so out of this task's scope, but it's now inconsistent with the corrected table.
- Pass 1's suggestion stands: a follow-up reconciling the banner with per-command `--help` (`check --fix/--step`, `doctor --yes`) would prevent the next instance of this class.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

