---
task: "1088"
pass: 2
at: "2026-11-11T19:41:28.650Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/copilot-auto-tier-efficiency-was-removed
state: ok
tree_identity: "43f4b8f1b:43f4b8f1b"
---
## Verdict
needs some work — freeform run errors gain the CLI name as a prefix, and engineer and reviewer run failures skip the Copilot tier guidance.

## Relevance
still relevant — `main` still hard-codes `efficiency` for `default` and `copilot-auto-efficiency`, so the premise holds.

## Evidence
- `default-1.png` (route `/`, auto-matched `src/ui-app/**`) shows Mission Control, not the Agents or Settings pages where the changed label and the agent-test message appear. The diff's visible change is the Settings label and error text, so this capture does not show it. Not blocking, since no acceptance criterion is purely visual.

## Bugs
**Class: a helper's positional arguments changed, and the call site was not updated.**
- `src/server/freeform-runs.ts:515-523`: `oneShotResultFromLog(..., record.agent.cli, record.agent.cli)` passes the CLI name into `commandName`, which defaults to `"agent"`. Every failed freeform run now reads `github copilot exited with code N: …` (or `claude code exited …`) instead of `agent exited with code N: …`. The diff added this line by mistake. No test pins the wording, so it passes unnoticed. Fix: drop the duplicate argument.

**Class: error-text producers that skip `formatCopilotAutoTierFailure`.** Criterion 2 requires that "the agent test and run error" show the tier guidance. Only `oneShotFailureDetail` calls the formatter, so these paths still show raw CLI output:
- Engineer run failures: the `detail` built from `stderrTail` in `src/server/agents.ts` (around lines 10780–10891, the `needsInputDetail` / `agent exited with an error` path).
- Reviewer runs: `sessionErrorText(lines)` in `src/server/review.ts:2018` and `:2478`.
- Model listing: `probeError` in `src/core/models.ts:175-186` builds its own stderr-derived message. This one is arguably out of scope.

Fix: run the Copilot formatter inside the shared detail producers, or in the places that build these messages, scoped to `cli === "github copilot"`, and add a test for each. I did not trace every branch of the engineer path, so confirm the exact call sites when fixing.

## Edge cases
- `COPILOT_AUTO_TIER_FAILURE` matches any `--auto-tier` mention. A Copilot "unknown option --auto-tier" error would be rewritten as a tier-unavailable message.
- The stderr path keeps only the last three lines, so a tier error printed earlier is not matched. This is unchanged from round 1 and still untested.
- The branch merges cleanly with `main` apart from the task's own `work/1088-*.md`, which close-out resolves. No source conflicts, per the landing checklist.

## Suggestions
- `src/core/agent-compatibility.json`: the `verificationSource` text for the 2026-10-04 live probe now says the id maps to Balance. That was never probed, so the record now describes an unverified mapping. Keep the original probe record and put the alias note in a separate field or in the docs.
- Criterion 3 (probing balance or intelligence at test time) is not implemented. It is documented as account-specific, which the spec allows.
- Add a Settings-page capture on the final tree showing the `Auto · Balance` label and the agent-test message.
- Round 1's findings are fixed: the Copilot rewrite is now scoped by `cli`, the negative test is in place, the unused export is gone, and the unverified "lowest-cost" wording and dates are removed.

## Could not verify (environment)
- Live `copilot --auto-tier balance` behaviour was not checked, as the spec and engineer both noted.

## Verdict
needs some work — freeform run errors gain the CLI name as a prefix, and engineer and reviewer run failures skip the Copilot tier guidance.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T19:40:05.167Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

