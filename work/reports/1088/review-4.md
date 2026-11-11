---
task: "1088"
pass: 4
at: "2026-11-11T20:55:51.161Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/copilot-auto-tier-efficiency-was-removed
state: ok
tree_identity: "c3853efd4:63d4f3534"
---
## Verdict
needs some work — the engineer activity line can splice guidance into the wrong place when the assistant's last words contain "stderr: ".

## Relevance
still relevant — `main` still maps `default` and `copilot-auto-efficiency` to `efficiency`, and this branch moves them to `balance`.

## Evidence
Not applicable: the code defect above is the blocker, not the capture. The shot is noted under Suggestions.

## Bugs
**Class: string surgery on a composed detail.** `src/server/agents.ts` (~10135, "engineer turn ended without a handoff") builds `detail` by joining `reason`, `last assistant` and `stderr:` with " · ", then patches it with `detail.replace(/stderr: .*$/, …)`. The regex hits the first `stderr: ` in the string, not the label. The assistant text is user-controlled and can quote "stderr: " (plausible in an engineering turn). The replace then truncates at that quote and writes the enriched guidance inside the assistant's text, dropping the real `· stderr:` label. Fix: enrich the stderr value before composing `detail`, or build the stderr segment separately. I found no other instance: the branch's other enrichment sites (`oneShotFailureDetail`, `lastFailureLine`, `detailOverride`, `sessionErrorText`, `testModelCombination`) pass text through the helper without patching a joined string.

## Edge cases
- `oneShotFailureDetail` (`agents.ts` ~5077) reads only the last three stderr lines and returns early when stderr is non-empty. A tier error in stdout, or earlier than the last three lines, is still raw. Unchanged since round 1, still untested.
- `suggestMatch` in `copilot-auto-tier.ts` splits on `\s+or\s+` after the first `.`. If the CLI lists tiers with commas (`balance, intelligence`), the suggestion becomes one bogus tier name. The CLI's exact wording is unverified.
- `probeError` (`src/core/models.ts`) stays raw. The Settings agent test goes through `model-test.ts`, which is enriched, so criterion 2 holds. The model-list probe is out of scope; say so in the report.
- Engineer turn `last assistant` text is dropped whenever enrichment matches, because the whole detail is replaced by the guidance.

## Suggestions
- Criterion 3 (test-time tier probe) is not implemented, and `docs/architecture.md` does not say the probe was skipped. Pass 3 asked for that line; it is still missing.
- `src/core/agent-compatibility.json` `verificationSource` still reads "8/8 seams passed … on model copilot-auto-efficiency" (2026-10-04). Only `upgradeGuidance` was updated. Add a note that the record predates the efficiency retirement, or re-certify.
- Shot `GitHub Copilot Auto · Balance default on Agents` (`default-1.png-1.png`, tree 63d4f3534, reviewed HEAD c3853efd4 with bookkeeping-only delta): the PNG shows the Agents page with pm, engineer and reviewer on Codex and Cursor. No Copilot card or Balance label appears, and only the page title is highlighted. The label claims more than the image shows. The capture is not blank or erroring and the route matched, so this is not blocking on its own.
- The pass-3 suggestion about the certify `argv` change (`COPILOT_CONTRACT.modelArgs` now emits balance for `default`) is intended. It deserves one line in the report.

## Could not verify (environment)
- Live `copilot --auto-tier balance` was not probed, per the spec.
- Merge status and landing preflight come from the server checklist; I did not run `merge-tree`.
- Prior passes 1–3 checked: the activity-line gap, the "Settings →" path and the self-suggesting failed tier are fixed. `probeError` remains raw, by the engineer's scope call.

## Verdict
needs some work — the activity-line splice bug must be fixed in the class-wide way above before sign-off.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T20:54:07.020Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

