---
task: "1073"
pass: 1
at: "2026-11-09T20:23:20.900Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/release-update-dialog-show-the-upgrade-c
state: ok
tree_identity: "a28e9f31c:642364def"
---
## Verdict
`needs some work` — source checkouts and linked dev builds get `repoos upgrade` instead of the git/bun command, because install-kind detection keys on a version that every build writes.

## Relevance
`still relevant` — the banner and dialog still lack an upgrade instruction, so the premise holds.

## Evidence
None. Both captures (light and dark) render the command block correctly on the `release:updateAvailable` fixture and match the diff. They use a hard-coded standalone payload, so they do not exercise install detection.

## Bugs
**Class: install-kind detection keyed on `.build-info.json` presence.** Every source build writes `version` from `package.json` into `dist/.build-info.json` (`scripts/copy-assets.mjs:32-34, 61-65`). The "source checkout" branch only fires when `version === null`, so a built checkout looks like a standalone install. Instances:

- `src/commands/upgrade.ts` `upgradeInstruction` / `cmdUpgrade`: a linked dev build (`repoos` → `repo/dist`, which AGENTS.md says is this repo's setup) reports `standalone` and prints `repoos upgrade`. This is the same wrong command the spec forbids. The CLI keeps this behaviour, and the new docs in `docs/releases.md:306-310` ("always matches what `repoos upgrade` would print") are false until it is fixed.
- `src/server/routes/release.ts` `installInfo()`: reads `readBuildMeta().version`, which falls back to `package.json` (`src/core/build.ts` ~285-295). A plain `bun src/...` source run with no `dist/` is therefore `standalone`, and the server disagrees with the CLI on the same checkout (CLI: source; server: standalone).
- Both sides of the server fallback use `installInfo()` (`fetchAvailableRelease` and the offline `getAvailableRelease` payload), so both carry the bug.

Fix the class in one place: the shared helper should decide "source" from the checkout (for example a `.git` or `src/` beside the `package.json` above the install root), and the server should pass the same version input as `cmdUpgrade`. Add route-level tests for source-with-dist and source-without-dist. The current tests pass `version: null` directly, so they never hit this path.

## Edge cases
- No server-route test covers the new `installKind`/`upgradeCommand` fields, including the offline fallback payload. The helper tests do not prove the wiring.
- A failed copy is silent: `copyCommand` returns without feedback when `copyToClipboard` is false. The spec asks for clear feedback.
- `copiedTimer` is not cleared on unmount.
- `resolveInstallRoot()` is a pure alias of `installRoot()`, and `types.ts` duplicates the install-kind union instead of reusing `InstallKind`.
- The shot fixture hard-codes `standalone`, so no capture covers the package-manager or source copy.

## Suggestions
- The channel form is right: `channelFromVersion` plus `--channel` matches `parseChannel`, and the banner copy is still accurate.
- The "Runs in your terminal… keeps the old version until you restart it" note matches `cmdUpgrade`, which does not restart anything.
- Dismissal is persisted per version with try/catch and tested. The previous-review check found no earlier passes (`work/reports/1073` has only round-1).

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-09T20:21:28.331Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

