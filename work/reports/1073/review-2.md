---
task: "1073"
pass: 2
at: "2026-11-10T02:16:02.710Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/release-update-dialog-show-the-upgrade-c
state: ok
tree_identity: "594050877:4cc2017b8"
---
## Verdict
`good to go` — Round-1 install-kind bug is fixed and route-tested; only the handoff captures are stale. STALE-EVIDENCE-ONLY

## Relevance
`still relevant` — `main` still has no upgrade instruction; the dialog only links to the release page.

## Evidence
None (captures are stale, not missing; see Suggestions). The shots were recorded on 4cc2017b8, but HEAD is 594050877. The PNGs show the "How to upgrade" block, Copy button and "Release notes" link on light and dark, with no console errors.

## Bugs
None found

Round-1 findings, checked against the current code:
- Source-checkout detection: fixed. `isSourceCheckout` checks the structure, and `installInfo()` passes the same `.build-info.json` version as `cmdUpgrade`.
- Server fallback: fixed. The offline payload carries `installKind`/`upgradeCommand`, covered by `release-install-route.test.ts`.
- Copy failure: fixed. "Copy failed" plus a status message.
- `copiedTimer` on unmount: fixed.
- `resolveInstallRoot` alias: removed.
- `types.ts` union: now reuses `InstallKind`.

## Edge cases
- `channelFromVersion` needs a dot after the channel (`-<channel>.`). A `0.6.0-rc1` install reads as stable and shows plain `repoos upgrade`, which would move it to stable. This matches the documented tag rule, so the risk is low.
- `isSourceCheckout` treats any parent holding `.git` as a checkout. A standalone install placed directly under a git repo root would be misdetected. The curl layout (`~/.local/share/repoos`, tarball `-C dist .`) is safe.
- No new bare `node`/`npm`/`npx` invocation. The `npm update -g` strings are pre-existing user-facing text, not spawned.
- Acceptance criteria 1, 2, 3, 4 and 6 are met in the code and tests. I did not re-run the suite or the merge check, per instructions.

## Suggestions
- Re-capture both shots on 594050877 so the evidence matches the reviewed HEAD.
- `ReleaseUpdateNotification.vue`: the `?? "repoos upgrade"` fallback would hide a missing field. Since the server always sends it, consider making it required.
- `cmdUpgrade` uses `readInstallVersion(root)!`. It is safe today because the `source` branch covers null, but an explicit guard would keep it local.
- The fixture pins only `standalone`, so the package-manager and source copy are covered by unit and route tests, not captures. That is acceptable.

## Verdict
`good to go` — Round-1 install-kind bug is fixed and route-tested; only the handoff captures are stale. STALE-EVIDENCE-ONLY

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-09T20:41:58.604Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

