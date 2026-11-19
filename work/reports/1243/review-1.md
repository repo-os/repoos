---
task: "1243"
pass: 1
at: "2026-11-19T20:56:58.554Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-agents-page-failure-copy-after-t
state: ok
tree_identity: "4f1e2c218:524afd1598"
---
## Verdict
`needs some work` — branch no longer merges with main (server preflight: conflict in `src/ui-app/tests/agents-page-qa-browser.test.ts`); sync, keep both sides, re-request review. Plus one same-class copy bug below.

## Relevance
`still relevant` — the Jev routing switch is live on main and the copy/empty-state defects this task targets are real; premise holds.

## Evidence
None — the one declared shot (`/agents?tab=model-routing`, `.mr-decisions`) was captured on tree 524afd1598 with zero console errors; only bookkeeping differs from reviewed HEAD 4f1e2c218, so it is current. The shot correctly shows the decisions list; the failed-load state is covered by the WebKit fixture as the label states, so it is not a gap.

## Bugs
- **Class: error rendered as a benign known state (empty-on-error catch)** — `ModelRoutingPanel.vue` `refreshStatus()` still swallows every failure and sets `status = null`, the exact pattern the engineer fixed for `refreshDecisions`. A failed status fetch shows the Jev key pill as "—" and provider ready as "Not ready" with no error notice — and for the OpenRouter branch of `credentialStatusText()` it shows **"Not set"**, a false missing-key claim, while `status?.issues` is undefined so the plain-English notice disappears. Same file, same class, one sibling function and the other branch of the fallback left unfixed.

No further findings of this class were found after grepping: `refreshStatus`/`refreshDecisions`/`runProbe`/`saveKey` catch blocks in ModelRoutingPanel.vue, other `= []` catch assignments in `src/ui-app/src`, `fallbackText`'s reason switch (all three reasons plus a default covered), the blocked-decision row (`d.message || d.blockReason`), and the wiring/policy surfaces (`model-routing-wiring.ts`, `policy.ts` message construction).

## Edge cases
- `{{ d.message || d.blockReason }}` (ModelRoutingPanel.vue:859) can print the raw slug `no-eligible-fallback`/`no-candidates` if a blocked decision ever records an empty message. Latent only — both policy block messages are always non-empty — but worth tightening while editing this file.
- A decisions load that succeeds with `decisions: undefined` (not `[]`) renders the real empty copy; acceptable, but the test could pin it.
- The engineer's one-off flake in `agent-review.test.ts` (#0101) passed on rerun; unrelated to this diff, no action here.

## Suggestions
- When syncing, re-verify the fixture wording conflict honestly: main moved this file 352 lines (#1223/#1241); keep both sides' assertions so neither state's copy check is lost.

## Could not verify (environment)
None.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T20:55:34.843Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

