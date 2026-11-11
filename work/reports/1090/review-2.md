---
task: "1090"
pass: 2
at: "2026-11-11T05:53:46.711Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/releases-page-blames-the-wrong-workflow-
state: ok
tree_identity: "aeae0a1ef:aeae0a1ef"
---
## Verdict
needs some work — The tap check matches a time window, not the viewed tag or version the freeze requires. Fix the match or amend the freeze.

## Relevance
still relevant — `main` still lists all push runs for the tag (`src/server/distribution.ts:265`), so the premise holds.

## Evidence
None. The code is not sound yet (see Bugs), so this is not an evidence-only case.

## Bugs
**Class: unmet frozen requirement (scope drift from the accepted spec).**

- `src/server/distribution.ts`, `homebrewTapUpdateInProgress` (~line 420): the freeze says to query the tap's formula-update workflow "and match the viewed tag or version". The code queries `actions/workflows/repoos-release.yml/runs?event=repository_dispatch` and matches only on the release run's time window (`created_at` between the release run's start and its `updated_at` plus 5 minutes). It never matches a tag or version. The engineer disclosed this and says the run list has no version. I could not verify that against the live API (no network), but the code does not do what the freeze asked.
- Fix options: (a) the tap sets its run name to include the version, e.g. `run-name: Update RepoOS formula ${{ github.event.client_payload.version }}`, which is a change in the tap repo and then match on `display_title`; or (b) the human amends the freeze to accept the time-window scope, and `docs/releases.md` already says so.
- Other instances of the class: none. The repo-wide `homebrew-tap/actions/runs` call is gone from the code (it survives only as mock data in the tests), and the callers at ~450 and ~507 consume the same boolean, so they need no change once the match changes.

## Edge cases
- The window runs from the viewed release's start to its last update plus 5 minutes. If another release's dispatch lands inside that window (releases cut minutes apart), an older out-of-sync Homebrew row reads Updating.
- A tap API error or rate limit (403) returns `false`, so the row reads Out of sync with no hint that the signal failed.
- A release run still in progress has a moving `updated_at`. A dispatch created after the last update plus 5 minutes is missed.

## Suggestions
- Visual proof is missing for the Updating state. The one handoff shot is `/` with a loading indicator (`aria-busy`) and shows no Releases page, so it has no Updating badge or banner. Declare a Releases-route shot with an out-of-sync Homebrew row.
- The freeze follow-ups are already present: the view test for the Updating label and violet CSS (`releases-distribution-view.test.ts`), and the `release.workflow`-unset note in `docs/releases.md`.
- Still open as follow-ups per the freeze: the grace window applying to a formula ahead of the tag, and one tap request per out-of-sync row against the unauthenticated quota.

## Could not verify (environment)
- Live GitHub response shapes (no network), including whether dispatch runs carry a version in `display_title`.
- I ran `git merge-tree --write-tree main HEAD` once by mistake (output suppressed; exit 1). I did not act on it and relied on the server's landing checklist, which says only the task file conflicts.

## Verdict
needs some work — The tap check is scoped by time window, not the frozen tag/version match; fix it or amend the freeze.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T05:52:50.702Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

