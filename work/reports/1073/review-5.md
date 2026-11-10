---
task: "1073"
pass: 5
at: "2026-11-10T09:46:09.984Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/release-update-dialog-show-the-upgrade-c
state: ok
tree_identity: "0cb635c7b:0cb635c7b"
---
## Verdict
`good to go` — all six acceptance criteria are met on 67eee4fe2, and the captures are current and show the command block in light and dark. Only non-blocking notes remain.

## Relevance
`still relevant` — main has no upgrade command, install-kind detection, or dismissal persistence; the dialog still only links to the release page.

## Evidence
None. Both declared shots (`default-1` light, `default-2` dark) were captured at 0cb635c7b, and HEAD differs only by `work/reports/1073/round-2.json`. I viewed both PNGs: the "How to upgrade" block, the `repoos upgrade` code block, a Copy button beside it, the restart note, and the relabelled "Release notes" link all render. Neither is blank or erroring, and the evidence JSON records `routeMatched: true` with zero console errors.

## Bugs
None found.

Earlier findings, checked against the code:
- Round 3, channel banner versus command mismatch: fixed. `fetchAvailableRelease` calls `fetchLatestRelease(install.channel)`, and the route test covers it.
- Round 4, empty `upgradeCommand` reporting "Copied": fixed. `copyCommand` treats an empty command as a failed copy.
- Round 2, copy-failure feedback and timer cleanup on unmount: present.
- Offline fallback in `getAvailableRelease` carries `installKind` and `upgradeCommand`.
- Dismissal persistence (AC4): implemented with try/catch and tested.
- No new bare `node`/`npm`/`npx` is spawned. The `npm update -g` strings are user-facing text for the matching install.

## Edge cases
- `isSourceCheckout` treats any parent holding `.git`, or both `src/` and `package.json`, as a checkout. A standalone install at a non-default `REPOOS_INSTALL_DIR` under such a parent (for example `~/repoos` with `~/.git`) is now told "source checkout", and `repoos upgrade` refuses it. The default `~/.local/share/repoos` is safe. This is a narrow CLI behaviour change, not a blocker.
- `cmdUpgrade` now prints the source-checkout message for any checkout with a `.build-info.json`, where it used to try a download. This is intended, but a human should confirm it.
- A beta install is compared only against newer builds on its channel, so it gets no banner for a newer stable release. This matches what `--channel beta` installs.

## Suggestions (non-blocking)
- No test calls `isSourceCheckout` directly. The source-checkout test uses a null version, so the round-1 case (a built checkout with a version) is unguarded. Add one.
- Tighten the structural probe, for example by requiring the install root's basename to be `dist` or `src` before checking the parent.
- `fetchLatestRelease` dropped the `Accept` and `User-Agent: RepoOS update checker` headers the old release check sent. Restore them for parity.
- `copyCommand` awaits before scheduling its timer. Unmounting mid-copy can therefore schedule a timer after `onUnmounted`. It is harmless, but a guard would close it.
- The "Copied" state is not announced to screen readers. Only the failure message has `role="status"`.
- The source-checkout command needs to run from the checkout directory, and the dialog doesn't say so.
- `readInstallVersion(root)!` in `cmdUpgrade` is a non-null assertion that is safe only because of the source branch above it.

## Could not verify (environment)
- I did not run the build or the test suite, per the review instructions. I relied on the engineer's green gate at 0cb635c7b and the server's landing checklist. The merge check shows a conflict only in the task's own `work/1073-*.md`, which close-out takes from main.

## Verdict
`good to go` — all acceptance criteria met on 67eee4fe2 with current captures; only non-blocking suggestions remain.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-10T09:12:54.095Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

