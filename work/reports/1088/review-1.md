---
task: "1088"
pass: 1
at: "2026-11-11T18:45:04.196Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/copilot-auto-tier-efficiency-was-removed
state: ok
tree_identity: "71f9ceeb9:d6a71bb0a"
---
## Verdict
needs some work — `oneShotFailureDetail` applies the Copilot tier rewrite to every harness, so other CLIs' "is unavailable" errors get Copilot advice.

## Relevance
still relevant — `efficiency` is still hard-coded as the default Copilot tier on `main`, so the premise holds.

## Evidence
None. The one capture (`default-1.png`, route `/`) shows Mission Control, which does not display the changed Agents/Settings label. No acceptance criterion is visual, so this is not a blocker. The engineer's report says the handoff check passed, and I did not re-run it.

## Bugs
**Class: a Copilot-specific rewrite is not scoped to the Copilot harness.** `formatCopilotAutoTierFailure` (`src/core/copilot-auto-tier.ts`) matches generic phrases such as `is unavailable`, `no longer available` and `auto-tier`. `oneShotFailureDetail` (`src/server/agents.ts:5080`) takes no `cli` argument, so the rewrite runs for every agent. All four return paths are affected:
- stderr path (~5084)
- stdout JSON `err` path (~5110)
- line-scan `errLine` path (~5124)
- fallback last-line path

Callers that inherit the bug: `agents.ts` 5314, 5335, 5414, 5426, and `model-test.ts` 154 and 173. Example: a Claude or Codex failure "model X is unavailable for your plan" is reported as "The selected Copilot Auto tier is not available for this account… pick Auto · Balance…". Fix: pass `cli` into `oneShotFailureDetail` and return early unless it is `github copilot`. Add a negative test with another CLI's "is unavailable" text. The current test covers only the positive case.

## Edge cases
- The stderr path keeps only the last 3 lines, so a tier error printed earlier in stderr is not matched. Probably acceptable; no test covers it.
- The tier-id regex `Set --auto-tier to (.+?)(?:\.|$)` truncates at a dot inside an id. Low risk.
- Mapping: `default`, empty, `copilot-auto-efficiency` and `copilot-auto-balance` → `balance`; `copilot-auto-intelligence` → `intelligence`; everything else passes through. Both `agents.ts` and the contract template now share this logic. Criteria 1 and 5 are met.
- `models.ts:431` still lists only `default`, `copilot-auto-balance`, `copilot-auto-intelligence`, so the alias is never offered. That is fine.

## Suggestions
- `COPILOT_AUTO_TIER_MODEL_IDS` is exported but unused; delete it or use it in the resolver.
- `agent-contract.ts:904` still sets the Copilot default to `copilot-auto-efficiency`. Change it to `default`, or accept the alias on purpose and say so in a comment.
- The failure text says "pass --auto-tier with an id your CLI accepts". RepoOS users cannot pass that flag, so the advice is not actionable. Point at the Agents dropdown only.
- The docs call Balance "the lowest-cost tier GitHub still exposes in common catalogs" and date the retirement "late 2026". Neither is verified. Soften both.
- Criterion 3 (live tier probe) is not done. The docs record it as account-specific, which the spec allows, so this is acceptable.

## Could not verify (environment)
- I ran `git merge-tree --write-tree main HEAD` once, against the instructions. It exited 1. That matches the server's landing checklist, which reports only the task's own `work/1088-*.md` conflicting; I did not list the conflicting files myself.
- Live `copilot` behavior was not checked, as the spec and engineer both noted.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T18:43:48.877Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

