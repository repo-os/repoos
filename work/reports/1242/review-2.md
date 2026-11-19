---
task: "1242"
pass: 2
at: "2026-11-19T19:46:55.189Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-hub-server-picker-and-add-server
state: ok
tree_identity: "69fa55d12:"
---
## Verdict
`good to go` — round-1 finding fixed, copy and refusal rules are correct and tested; nothing blocks sign-off.

## Relevance
`still relevant` — the add-flow genuinely rewrote unsafe schemes into fetchable hosts, saved non-RepoOS pages, allowed duplicate names, and showed vague errors; this diff fixes all of it with tests.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: `mobile/src/components/*.vue` (all `role="alert"` paragraphs), `mobile/src/App.vue`, `mobile/src/app-state.ts`, `mobile/src/reachability.ts`, `mobile/src/server-entries.ts`, `mobile/src/tailnet.ts`, `src/ui-app/tests/*`, `mobile/scripts/*`, `user-docs/*`.

## Edge cases
- Round-1 pass-1 finding verified fixed: `TailnetDiscoveryView.vue:70` now carries `role="alert"`, and a new test (`mobile-hub-add-server-errors.test.ts`) covers both announcement sites. The rename-sheet error (`hub-sheet-error`) is also announced and reset on open/close.
- Health contract `{ ok: true }` matches `src/server/routes/info.ts` (line 150); the sibling test fixture `mobile-tailnet-discovery.test.ts` was updated to the real shape.
- `refreshReachability` (the other `validateServer` caller) maps errors to a status label only, so no unannounced raw copy survives there.
- `addSelectedDiscovered` reuses `addServer`, so discovery picks get the same duplicate/URL messages; multi-pick errors concatenate into the announced banner.
- Minor lenient parse: input like `https:7171` is treated as authority `https:7171` (host named "https"), since a digit after the colon disables scheme detection. The fetch then fails with the standard unreachable message — harmless, no unsafe request.
- The stricter health check refuses older RepoOS servers without `ok: true` and the rename double-tap both remain open, deliberately recorded in the QA doc's "Not covered" — design decisions deferred, per round 1.

## Suggestions
- The QA doc's 340-check figure is from the round-1 sweep and was not rerun this round — the engineer says so plainly in the report and the doc, which is honest; a fresh run before close-out would be cheap re-confirmation, not a blocker.
- `shots: skipped` is correct for this diff (no declared capture target for the mobile app); nothing to look at.
- Discovery duplicate-name rename and the double-tap guard deserve the follow-up tasks the engineer proposes.
- Merge warning is only this task's own `work/1242-*.md`; close-out takes main's copy.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

