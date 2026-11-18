---
task: "1168"
pass: 2
at: "2026-11-18T01:58:28.044Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-exercise-the-new-releases-genera
state: ok
tree_identity: "9f665b1fd:9f665b1fd4"
---
## Verdict
`good to go` — the pass-1 copy defect is fixed and tested, and every required state now has current, valid captures.

## Relevance
`still relevant` — the #1126 chooser and #1154 restart notice are on main and this is their only end-to-end QA record.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: both `activeWork` interpolations in `ReleaseUpdateNotification.vue`, the `restartNoticeFetch` fixtures and restart tests in `releases.test.ts`, the release banner/notice fixtures, and all count copy in the touched component.

## Edge cases
- The local QA harness's `releaseMutationCalls` counter is never incremented (`.repoos/qa-pass-1168-round2/qa-round2.mjs:18,134`), so "asserted zero release mutation calls" is a vacuous assertion; the no-release guarantee actually rests on `page.route('**/api/release/**')` interception. That is sufficient (the script never clicks Publish, and every release call is fulfilled locally), but the record overstates what the counter proved.
- launchd/systemd still render action buttons rather than a command; "a correct command otherwise" holds only for the `uncertain` state, which is now captured and covered by a component test. Same interpretation as pass 1, not a new defect.
- 0-of-both counts read "0 agents and 0 checks running"; the new table test pins that wording deliberately.

## Suggestions
- Either make the harness's mutation guard real (count and 409 POST/DELETE to `/api/release`) or drop the "zero release mutation calls" claim from `docs/qa/2026-11-releases-and-restart-qa.md`; right now the sentence claims verification the script does not perform.
- The dark chooser and 390px Publish states are not captured. Not required by the spec, but they would complete the matrix.

Checked: the pluralization fix renders "2 agents and 1 check running" in every restart capture; pass-1's mid-transition dark shots are re-captured settled and readable at 1440/390; Notify never promises publishing; Notify and Publish pending survive reload and cancel; the failed draft shows "was not published automatically"; the 24 attached PNGs match the local evidence set; the focused `releases.test.ts` passes (44/44); the scratch worktree and port 7278 claims are corroborated by the engineer transcript.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-18T01:53:24.676Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

