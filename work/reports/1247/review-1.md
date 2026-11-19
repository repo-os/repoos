---
task: "1247"
pass: 1
at: "2026-11-19T21:38:45.479Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-checks-page-live-run-view-and-ca
state: ok
tree_identity: "ce2c02857:6ffc5ab0e9"
---
## Verdict
`good to go` — EVIDENCE-GAP-ONLY. Code is sound; the single auto capture shows the dashboard, not the changed Checks page states.

## Relevance
`still relevant` — the live run view overflow and the silent failed/successful slot release are real defects, now fixed and regression-tested; the premise (QA this view at 3 widths) holds.

## Evidence
The handoff capture `auto: matched src/ui-app/** → http://127.0.0.1:40937/` (`default-1.png-1.png`) renders the Mission Control route `/`, not the Checks page Now tab in any of the four seeded states, so no capture visually shows the diff. It is not blank or broken, the recorded console log is clean, and the engineer documented in `docs/qa/2026-11-checks-live-run-qa.md` why measured box assertions (run green in the handoff check) were used instead of screenshots — a truthful exception. A capture of the Checks page would still be worth having.

## Bugs
None found

No further findings of this class were found after grepping: ChecksView error.value set sites (228/232) and their only render sites (482–483, plan-tab branch), sibling Now-tab components (IntegrationPipelineSummary shows `active.error` inline; RemoteRunnersPanel uses its own local error ref + pushToast; TestRunPanel delegates to `repo.onError`), all 13 ConfirmDialog consumers, `releaseLocalCheckSlot` in `src/core/cross-process-slots.ts` (terminates the process group for wedged holders, so the notice copy is accurate; the Release button only shows for wedged, non-dead holders) and the `/api/local-check-slots/:slot/release/:pid` route in `src/server/server.ts`. The pre-existing `node scripts/run-tests.mjs` in `package.json` is untouched by this diff and is documented allowed Node usage; the new test files add no bare `node`/`npm`/`npx`.

## Edge cases
- Double-clicking the dialog's confirm sends two release POSTs (shared `ConfirmDialog` has no busy/disabled state; pre-existing). With this diff the page would then show the success notice *and* the 409 "no longer held" alert together — contradictory feedback on one action.
- `slotActionNotice`/`slotActionError` are never cleared by the 5 s slot poll; a "Released slot 0 (PID 5150)" notice can outlive the state it describes if the slot is re-held.
- Remaining instance of the cross-tab error class: `load()` sets the page-level `error` ref, rendered only in the plan-tab branch, while `onMounted` runs `load()` regardless of tab — a failed initial plan fetch is invisible while the user is on the Now tab.

## Suggestions
- Clear the slot action notice/alert when the slot list refresh shows a new holder, or age it out after the next poll.
- Declare 1–2 shots for the Checks page Now tab (running/unbroken-machine-name and a failed release) so future review has visual evidence.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T21:36:37.212Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

