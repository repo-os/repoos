---
task: "1073"
pass: 3
at: "2026-11-10T04:20:17.338Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/release-update-dialog-show-the-upgrade-c
state: ok
tree_identity: "594050877:4cc2017b8"
---
## Verdict
`needs some work` — a beta-channel install is shown a version the `--channel` command cannot deliver, and the captures are stale for the reviewed HEAD (03b9bee21).

## Relevance
`still relevant` — `main` still has only the release link, so the upgrade instruction is still missing.

## Evidence
Captures are stale, not missing. Both PNGs were taken at 4cc2017b8, and the code changed afterward in `upgrade.ts`, `release.ts`, `ReleaseUpdateNotification.vue` and `types.ts`. Re-capture both `release:updateAvailable` shots (light and dark) on 03b9bee21. The existing shots are not blank or erroring: the command block, Copy button, note and relabelled "Release notes" link all render, and the recorded console log is clean.

## Bugs
**Class: channel command and availability check disagree.** The dialog's version comes from a stable-only check, but its command is channel-scoped.

- `src/server/routes/release.ts` `fetchAvailableRelease`: compares against `/releases/latest`, which excludes prereleases. `installInfo()` then sends `repoos upgrade --channel beta` for a beta install. Scenario: installed `0.5.80-beta.1`, stable `0.5.81` is out. The dialog says "Upgrade to RepoOS 0.5.81" and copies `repoos upgrade --channel beta`. `cmdUpgrade` (`src/commands/upgrade.ts` `fetchLatestRelease`) returns the newest beta tag, which is `0.5.80-beta.1`, so the user gets "Already up to date". A newer beta (`0.5.81-beta.2`) never produces a banner at all.
- `docs/releases.md` (new paragraph) and `user-docs/getting-started.md` both say the dialog command "always matches what `repoos upgrade` would print". For a beta install, bare `repoos upgrade` checks stable, so that claim is false.
- The channel test in `release-install-route.test.ts` checks only the command string, not the version the banner compares.

Fix in one place: for channel installs, either compute `latestVersion` from the channel list (the same lookup `cmdUpgrade` uses), or keep the stable banner and say the command installs the newest `<channel>` build. Then add a route test for a beta install with a newer stable release, and correct the two docs.

## Edge cases
- Verified: install-kind detection is fixed from round 1 (`isSourceCheckout`, `installInfo` passing the `.build-info.json` version). Offline fallback carries both fields. Copy failure and timer cleanup are handled. The restart note matches `cmdUpgrade`, which does not restart the server.
- `isSourceCheckout` treats any parent holding `.git` as a checkout. Curl installs (`~/.local/share/repoos`) are safe.
- No new bare `node`/`npm`/`npx` invocation is spawned. `npm update -g` and `pnpm update -g` are user-facing text only.
- Not run, per instructions: test suite and merge check. The landing checklist already shows the merge as conflict-free apart from this task's own file.

## Suggestions
- `ReleaseUpdateNotification.vue`: the `?? "repoos upgrade"` fallback would hide a missing server field. Make `upgradeCommand` required.
- Styling: `.release-update-code { flex: 1 1 100% }` forces the Copy button under the code block in both captures. If side-by-side was intended, drop the 100% basis.
- `installInfo()` runs two filesystem probes on each fetch and fallback. This is negligible, but it could be computed once.

## Verdict
`needs some work` — beta-channel banner and command mismatch (release.ts, docs); re-capture the stale shots on 03b9bee21.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-09T20:41:58.604Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

