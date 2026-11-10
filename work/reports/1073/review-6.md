---
task: "1073"
pass: 6
at: "2026-11-10T11:15:43.266Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/release-update-dialog-show-the-upgrade-c
state: ok
tree_identity: "0cb635c7b:67eee4fe2"
---
Repeated review classes: earlier passes kept finding the same few classes: the banner comparing against a different release than `repoos upgrade` installs, the Copy button reporting success with nothing copied, and install-kind detection drifting from the CLI. Each one is fixed on 67eee4fe2 and I checked the code for it. Shot-capture staleness recurred too, and it is fixed: the captures are on this HEAD. A human should still look at the recurring pattern, which is that the same logic was reimplemented in more than one place before this pass.

## Verdict
`good to go` — the command, install kind, channel comparison, Copy feedback, dismissal persistence and docs all match the spec on 67eee4fe2; only non-blocking notes remain.

## Relevance
`still relevant` — main still has no upgrade command, install-kind detection or dismissal persistence, and the dialog still only links to the release page.

## Evidence
Both declared captures (`default-1` light, `default-2` dark) are on 67eee4fe2, the tested tree, and the diff since 0cb635c7b is only `work/reports/1073/round-2.json`. Both PNGs show the "How to upgrade" block with `repoos upgrade`, a Copy button, the restart note and the relabelled "Release notes" button, with no blank or error state. The evidence JSON shows `routeMatched: true` and zero console errors. The banner copy is unchanged.

## Bugs
None found.

## Edge cases
- Re-checked the pass-5 items against the code, and none is a regression. The source-checkout command in the dialog and the CLI now both include `bun install`. `cmdUpgrade` prints the source message for any checkout instead of attempting a download; that was the intended fix, and a human should confirm the CLI change.
- The spec asked for "a running server restarts afterwards", but `upgrade.ts` never restarts anything. The shipped copy says the old server keeps running until restarted, which matches what happens.
- A package-manager install on a beta version is compared only against the stable latest, so it never sees a newer beta banner. The old code had the same stable-only behaviour, so this is not a regression.

## Suggestions (non-blocking)
- Still open from pass 5: `copyCommand` schedules its timer after the await, so a copy that finishes after unmount leaves a stray timer; the "Copied" state is not announced to screen readers; `fetchLatestRelease` dropped the old `Accept` and User-Agent headers; `isSourceCheckout` has no test for a built checkout that has a version; the source command doesn't say to run it inside the checkout.

## Could not verify (environment)
- I did not run the build or the test suite, as instructed. I relied on the green gate and the server's landing checklist, which show the only merge conflict in the task's own `work/1073-*.md`.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-10T09:46:15.992Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

