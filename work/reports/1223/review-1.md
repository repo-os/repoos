---
task: "1223"
pass: 1
at: "2026-11-19T09:35:35.979Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-agents-page-model-providers-and-
state: ok
tree_identity: "9bd224ffc:11d3dd78c4"
---
## Verdict
`good to go` — code and fixtures check out; one declared capture shows a narrower state than its label claims (evidence nuance only). EVIDENCE-GAP-ONLY

## Relevance
`still relevant` — the QA premise holds: the Agents surfaces had not been rechecked since the Jev routing change, and this diff fixes five real layout/logic defects and commits the QA doc.

## Evidence
- Shot 2 (`Model providers: opencode Go usage without the spurious empty-state line`, `/agents?tab=providers`): the highlighted opencode Go row shows its key form and **no usage windows**, i.e. the dev server has no key saved (`loadUsage` only runs when `hasKey`), so `windowedUsage` is null and neither old nor new code would render the line. The capture cannot distinguish the fix; the committed fixture test (`agents-page-qa-browser.test.ts`, 2 windows + `not.toContain("No usage reported yet.")`) is the actual proof.

## Bugs
None found

No further findings of this class were found after grepping: sibling usage fallbacks (`No usage reported for this period.` DeepInfra branch — already guarded by `!usageError`), all other `.field-label` uses (ModelRoutingPanel lines 605/754 are `<div>`s; BudgetControlsPanel `.budget-field-label` is `display: block`; ReleasesView uses `<label>`), all `role="switch"` render sites (only AgentCard's Radix switch; the 44px rule is `.agents-page`-scoped), the `windowedUsage(...)!.windows` non-null assertions (safe inside the truthy `v-else-if` branch), and the new test's `node:` protocol imports (allowed; no bare `node`/`npm`/`npx` invocations in the diff).

## Edge cases
- Muse message present with zero windows: only the muse notice renders, no "No usage reported yet." — deliberate priority, reads fine.
- Saved key but usage fetch returns zero windows and no message: the fallback now fires (`!windows.length`) — the intended case is preserved.
- `.mr-live-toggle` `nowrap`: a very long toggle label could overflow at 375px, but the provider-failure fixture audits that exact state at 375 with no overflow.
- Fixture fidelity: missing-key routing fixture (`credentialPresent: false` + issue) matches real `modelRoutingStatus()` behaviour; the provider-failure fixture clears the issue — consistent.

## Suggestions
- Shot 3's label mentions the "masked key form", but the capture shows the form closed (Paste API key button); the masked input is only proven by the fixture test.
- Consider declaring the opencode Go providers shot with a `state` fixture so a future capture can actually show usage windows without depending on dev-server key state.

## Verdict
`good to go`

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T09:32:21.034Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

