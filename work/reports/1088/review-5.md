---
id: review-5
title: review-5
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: feat/copilot-auto-tier-efficiency-was-removed
task: "1088"
pass: 5
at: "2026-11-11T21:18:01.645Z"
agent: reviewer
cli: claude code
model: haiku
state: ok
tree_identity: "e3e022e95:4feef727a3"
---
## Verdict
needs some work — freeform run errors lost their CLI name at `freeform-runs.ts:515`; the fix is one line, and the rest of the branch is sound.

## Relevance
still relevant — `main` still maps `default` and `copilot-auto-efficiency` to `efficiency` (`agent-contract.ts:695`, `agents.ts:3448`), and this branch moves them to `balance`.

## Evidence
Not applicable to the verdict; the shot gap is listed under Suggestions. Sign-off is blocked by the code defect above, not by evidence, so `EVIDENCE-GAP-ONLY` does not apply.

## Bugs
**Class: positional argument drift when an optional parameter was inserted.** `oneShotResultFromLog` gained `cli` as its 6th argument, after `commandName`. The one caller that passed the CLI name as `commandName` was not updated to match.

- `src/server/freeform-runs.ts:515-521`: on `main` the 5th argument is `record.agent.cli`, so freeform failures read `github copilot exited with code N: …`. This branch changes it to the literal `"agent"`, so every freeform CLI now reads `agent exited with code N: …`. That changes existing error text without mention in the report. `src/ui-app/tests/agent-drivers.test.ts:347-360` then pins the new wording.
Fix: pass `record.agent.cli` as `commandName` and `record.agent.cli` as the 7th argument, then restore the test expectation.
- I checked the other `oneShotResultFromLog` callers (`antigravity-driver.test.ts`, which passes `"antigravity"`). They are unaffected.

## Edge cases
- Round 5's fix is in place: the stderr segment is enriched before the activity line is composed (`agents.ts:10122-10135`). `oneShotFailureDetail` enriches all three of its return branches (`agents.ts:5078-5121`). Review, model-test, and `lastFailureLine` also pass `cli`. Pass 4's comma split and "never suggest the failed tier" are covered by tests.
- Raw `providerFailureDetail` consumers still exist: `agents.ts:9704` (`errorReason`), `10061` (`exitCause`), and `10206` (`crashReason`). They are latent, because `isProviderFailureReason` does not match the Copilot tier text today.
- `session` is optional at the activity-line and `lastFailureLine` call sites. A missing session silently skips enrichment.
- No bare `node`/`npm`/`npx` was added. The diff touches no scripts, shebangs, or justfile recipes.

## Suggestions (non-blocking)
- Acceptance 3 (test-time tier probe) is not implemented. Nothing in `docs/architecture.md:~380` says so explicitly. One sentence saying "RepoOS does not probe tiers; the CLI error is the source of truth" would close it.
- Shot `default-1.png` (Agents page, `.agents-page-title` highlight) does not show a GitHub Copilot card. The visible agents are codex, cursor, and the reviewer, so "Auto · Balance default" is not on screen. Recapture with the copilot agent in frame, or scroll to it. The route and target are correct, and the console was clean.
- `oneShotFailureDetail`'s `cli` parameter is optional and defaults to silent. Making it required would stop a future caller from skipping enrichment.
- `copilot-auto-tier.ts` parses the CLI's wording, which is unverified live. The tests cover the phrasings the engineer chose, not the real CLI output.

## Could not verify (environment)
- Live CLI tier wording and the `--auto-tier balance` probe were not run, which matches the spec.
- Merge and landing preflight are taken from the server checklist (merge WARN on the task file only); I did not re-run them.

## Verdict
needs some work — freeform error text regressed at `freeform-runs.ts:515`; one-line fix, then re-review.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T21:16:06.995Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

