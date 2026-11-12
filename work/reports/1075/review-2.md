---
task: "1075"
pass: 2
at: "2026-11-12T17:01:33.143Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/tell-the-user-when-an-installed-upgrade-
state: ok
tree_identity: "ad6bb4b47:ad6bb4b47"
---
## Verdict
good to go

## Relevance
`still relevant` — Installed-on-disk versus running-process version mismatch is still unsolved elsewhere; this extends #1072/#1073 post-upgrade.

## Evidence
None

## Bugs
None found

## Edge cases
Restart dismiss only writes `localStorage`; `restartNoticeVisible` is not reactive to that, so the banner can remain up to the 3s poll (release banner uses `dismissed` ref). CLI `--when-idle` polls agent/check counts only, not `closeOutLock`, unlike the server idle timer. Immediate restart failures are log-only. `help.ts` lists `--when-idle` in usage but not in `flags`.

## Suggestions
Mirror release dismiss with a reactive ref for instant hide. Add a component test for the restart notice, pending/cancel, and unsupervised copy. Pluralize “1 check”. Put `--when-idle` in `help.ts` `flags`. Drop duplicate `isNewerVersion` coverage in `src/core/release-version.test.ts` (route test already mocks disk version).

## Could not verify (environment)
Shot PNGs were not readable from this sandbox; handoff UI verification (ad6bb4b, matches reviewed code apart from bookkeeping) reports two captures, matching routes, zero console errors, and no blank shots.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-12T16:59:58.762Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

