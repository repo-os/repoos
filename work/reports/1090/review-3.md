---
task: "1090"
pass: 3
at: "2026-11-11T06:32:17.314Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/releases-page-blames-the-wrong-workflow-
state: ok
tree_identity: "68ff2b7f2:68ff2b7f2"
---
## Verdict
good to go — the code meets all five criteria and the earlier tag/version finding is closed by the owner's amended scope. EVIDENCE-GAP-ONLY: the one handoff capture is the wrong route, so there is no visual proof of the Updating row or banner.

## Relevance
still relevant — `main` still lists every push run for the tag (the removed `fetchCiFailure` query), so the premise holds.

## Evidence
- `default-1.png` (auto, route `/`, `routeMatched: true`, zero console errors): shows Mission Control, not the Releases page. It has no Updating badge, no Out-of-sync row and no release-workflow banner, so it proves nothing about this change.
- No shot was declared for the Releases route with an out-of-sync Homebrew row. The label and violet badge are covered by the view tests in `releases-distribution-view.test.ts` instead, which is what the accepted scope asked for.

## Bugs
None found

Class check (unscoped Actions signal, the class behind #1090): all three GitHub calls in the diff are scoped. Release runs use `actions/workflows/<basename>/runs` with `branch` and `event=push`, failed-step lookups use `run.id`, and the tap check uses `repoos-release.yml` with `event=repository_dispatch`. No repo-wide run list remains in `src/server/distribution.ts`. Errors fail closed: a failed release-run query gives no banner and no window, and a failed tap query gives Out of sync.

## Edge cases
- `homebrewTapUpdateInProgress` reads only `per_page=10` dispatches. If more than ten dispatches land after the viewed release's, its in-window dispatch can drop off the list.
- A Homebrew channel with a `versionUrl` but no `url` yields no tap repo (`src/server/distribution.ts`, `applyHomebrewUpdatingState` and the tap-repo loop), so the tap is never checked. This is silent and undocumented. Acceptable, but worth a line in `docs/releases.md`.
- Merge with `main`: the server checklist shows only the task file conflicting, which is a close-out matter and not a source conflict.

## Suggestions
- Declare one shot on the Releases route with an out-of-sync or updating Homebrew row, so the new badge and the banner have visual proof.
- Accepted scope, not blocking, and unchanged: the time-window match in place of the tag/version match, the window overlap with another release's dispatch, the tap-error case reading Out of sync, and the missed late dispatch on a still-running release.

## Could not verify (environment)
- Live GitHub response shapes: no network, so the mocked `workflow_runs` and `repository_dispatch` payloads are unchecked against the real API.
- I did not re-run `repoos check` or `merge-tree`, as instructed; I rely on the server's landing checklist.

## Verdict
good to go — code correct and complete; EVIDENCE-GAP-ONLY: the only capture is `/` (Mission Control), so the Releases Updating state has no visual proof.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T06:31:13.708Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

