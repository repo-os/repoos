---
task: "1090"
pass: 1
at: "2026-11-11T05:02:27.597Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/releases-page-blames-the-wrong-workflow-
state: ok
tree_identity: "c521580dd:52cbc55854"
---
## Verdict
needs some work — "Updating" trusts any active run in the Homebrew tap, not the tap's formula-update run, which repeats the unscoped misattribution this task fixes.

## Relevance
still relevant — main still lists all push runs for the tag (`src/server/distribution.ts` on main, line 265), so the premise holds.

## Evidence
Not an evidence-only case; the code defect above blocks sign-off. The one handoff shot, `default-1.png-1.png` (route `/`, auto), shows Mission Control, not the Releases page, so it shows no Updating badge or banner. No shot was declared. The two behavioural criteria (1, 2) are covered by unit tests, so this is a gap in visual proof only.

## Bugs
**Class: unscoped signal (same class as #1090).**

- `src/server/distribution.ts`, `homebrewTapUpdateInProgress`: it calls `repos/<tap>/actions/runs?per_page=10` with no workflow or tag filter. Any queued or in-progress run in the tap (CI on another commit, any workflow) marks every out-of-sync Homebrew row as **Updating**. Example: viewing an old tag whose formula is out of sync, while the tap runs unrelated CI, shows "Updating" when it should stay "Out of sync". Fix: query the tap's formula-update workflow file (`actions/workflows/<file>/runs`), match the tag or version, and add a test where an unrelated tap workflow is in progress and the row stays out-of-sync.
- Same function and its callers, lines ~409 and ~464: the tap repo set and the `tapBusy` branch in `applyHomebrewUpdatingState` both consume that repo-wide signal. They must change with the query above; no other instance is in the diff.
- The tests (`distribution.test.ts`, the "labels Homebrew as updating while the tap workflow is still running" case) mock every tap call with the same in-progress run, so they cannot catch this. Add a case with an unrelated tap workflow.
- Release-run queries are correctly scoped (`listReleaseWorkflowRuns`, `workflows/<basename>/runs`). I checked the other callers and the `fetchCiFailure` name; no other unscoped Actions queries were introduced.

## Edge cases
- `release.workflow` unset: the banner and grace window are silently disabled, and no docs line says so. Acceptable under criterion 1, but worth one sentence in `docs/releases.md`.
- Grace window applies to any out-of-sync Homebrew row while the viewed tag's release run is young, including a formula that is ahead of the tag. Low impact.
- Unauthenticated GitHub API quota: each out-of-sync Homebrew row adds one tap request per check.
- `releases-distribution-view.test.ts` has no case for the `updating` label, the aggregate "updating" line, or the violet CSS rule.

## Suggestions
- Add a view test for the `updating` state and the aggregate "Distribution destinations are updating" line.
- Re-capture a declared shot on the Releases route with an Updating row (`route` for the Releases page, state fixture), so the new badge has visual proof.
- Docs: `docs/releases.md` already says the tap's update workflow matters; once the query is scoped, name the tap workflow file there.

## Could not verify (environment)
- Live GitHub responses: the sandbox has no network, so the mocked response shapes are unchecked against the real API.
- I ran `git merge-tree --write-tree main HEAD` once before noticing the landing checklist told me not to. It exited 1. I relied on the server's checklist (only the task file conflicts) and did not act on my result.

## Verdict
needs some work — scope the Homebrew "Updating" check to the tap's formula workflow and tag, with a regression test, then re-request review.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T05:00:46.002Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

