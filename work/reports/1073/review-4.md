---
task: "1073"
pass: 4
at: "2026-11-10T06:29:52.436Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/release-update-dialog-show-the-upgrade-c
state: ok
tree_identity: "785b70e0e:4cc2017b8"
---
## Verdict
`good to go` — the round-3 beta-channel mismatch is fixed and no new code defects were found; the handoff captures are stale. STALE-EVIDENCE-ONLY

## Relevance
`still relevant` — `main` still has only the release link, with no upgrade instruction in the dialog.

## Evidence
Both declared shots (`release:updateAvailable`, light and dark) were captured at `4cc2017b8`; HEAD is `785b70e0e`. The PNGs are not blank and show the "How to upgrade" block, Copy button, note and relabelled "Release notes" link, with a clean console. The code changed afterwards (the beta-channel fix in `release.ts`, and the `.release-update-code` flex change), so re-capture both shots on the final tree before sign-off. The current `flex: 1 1 auto` should put Copy beside the code, but the existing captures show it wrapped beneath.

## Bugs
None found

Round-3 items, checked against the current code:
- Beta-channel mismatch: fixed. `fetchAvailableRelease` now uses `fetchLatestRelease(install.channel)`, so a channel install compares against the newest channel build, and `docs/releases.md` and `user-docs/getting-started.md` now say so.
- Copy button wrapping: the `flex: 1 1 100%` basis is gone.
- Round-1/2 items (source-checkout detection, offline fallback fields, copy failure, timer cleanup) still hold.
- Bare `node`/`npm`/`npx`: none spawned. The `npm update -g` and `pnpm update -g` strings are user-facing text in `packageManagerUpgrade`.

## Edge cases
- Merge: `git merge-tree` reports a conflict only in `work/1073-release-update-dialog-show-the-upgrade-c.md`, the task's own file, which close-out takes from main. Source files merge cleanly.
- `cmdUpgrade` now prints the source-checkout message for any checkout (`isSourceCheckout`), even one with a `.build-info.json` version. Before, it would have tried a standalone download into that checkout. This is an intended fix, but it is a CLI behaviour change beyond the spec, so the human should know about it.
- An empty `upgradeCommand` would make Copy report "Copied" with nothing on the clipboard. The server always sends the field, so this is low risk.
- Channel installs with no matching release in the last 30 throw, and the route falls back to `null`, so the banner stays hidden. That is correct.

## Suggestions
- Re-capture `release:updateAvailable` light and dark on `785b70e0e` and check Copy sits beside the command.
- Make `upgradeCommand` a required prop, or fall back to `"repoos upgrade"` rather than an empty string.
- Compute `installInfo()` once per process instead of on every fetch and fallback.

## Verdict
`good to go` — the round-3 beta-channel mismatch is fixed and no new code defects were found; the handoff captures are stale. STALE-EVIDENCE-ONLY

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-09T20:41:58.604Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

