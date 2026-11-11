---
task: "1073"
pass: 7
at: "2026-11-10T12:41:49.064Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/release-update-dialog-show-the-upgrade-c
state: ok
tree_identity: "8345674cc:8345674cc3"
---
Repeated review classes: earlier passes kept finding three classes: the banner comparing against a different release than `repoos upgrade` installs, the Copy button reporting success with nothing copied, and install-kind detection drifting from the CLI (the same logic was reimplemented in `release.ts` and `upgrade.ts`). All three are fixed on this HEAD, and I checked each in the code. Shot staleness also recurred and is fixed. A human should still look at the pattern: the same logic had to be reimplemented in more than one place before it converged.

## Verdict
`good to go` — the command, install kind, channel form, Copy feedback, dismissal persistence and docs match the spec; only non-blocking notes remain.

## Relevance
`still relevant` — the dialog still only links to the release page on the base branch, so the upgrade command and dismissal persistence are still needed.

## Evidence
Both declared captures (`default-1` light, `default-2` dark) were taken on tree 8345674cc. Since then the only source change is the removal of one `currentVersion` assertion in `release-install-route.test.ts`, so the captures still describe the UI. I viewed both PNGs: each shows "How to upgrade", `repoos upgrade` in a code block, a Copy button beside it, the restart note, and the relabelled "Release notes" button. Neither is blank or erroring. The evidence JSON records `routeMatched: true` and zero console errors. The banner copy is unchanged.

## Bugs
None found.

## Edge cases
- Pass 6 items re-checked: the banner compares against the channel release (`fetchLatestRelease(install.channel)`), an empty `upgradeCommand` counts as a failed copy, and dismissal is stored by version with try/catch. All hold.
- Merge: `git merge-tree --write-tree main HEAD` conflicts only in `work/1073-release-update-dialog-show-the-upgrade-c.md`, the task's own file. No source files conflict.
- Bare `npm`/`node` strings in the diff are user-facing instruction text or test fixtures. Nothing spawns them.
- The test change drops the `currentVersion` assertion. Install detection is still asserted, so the reason given (the version tracks the build) holds.

## Suggestions (non-blocking)
- Pass 5 items still open, none blocking: a test for `isSourceCheckout` on a built checkout that has a version; restoring the old `Accept` and User-Agent headers on the GitHub fetch; a guard so a copy that finishes after unmount does not schedule a timer; a "Copied" live-region announcement; and a note in the source command that it runs from the checkout directory.
- The `currentVersion` assertion removed from the route test could be re-added against a version read from the same `.build-info.json`, so the test still checks the banner's version source.

## Could not verify (environment)
- I did not run the build or test suite, per the review instructions. I relied on the engineer's green gate and the server's landing checklist.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-10T12:40:29.470Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

