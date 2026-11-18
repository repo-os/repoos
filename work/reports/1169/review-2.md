---
task: "1169"
pass: 2
at: "2026-11-18T03:27:19.885Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-macos-repoos-hub-app-build-launc
state: ok
tree_identity: "82800b830:"
---
## Verdict
`needs some work` — signed-in projects/tasks screens still unverified with no held human task filed; test-host scratch dirs are never cleaned up.

## Relevance
`needs rescoping` — #1167 (merged 2026-11-17T23:44) already drove the Hub's signed-in UI and captured Mission Control, so the "unusable for weeks / nobody has driven it" premise is stale; the distinct value here is the test-host registry isolation fix plus this record.

## Evidence
None

## Bugs
- **Class: incomplete acceptance coverage** — `docs/qa/2026-11-macos-hub-qa.md` leaves the Desired UX "shows projects/tasks without errors" unverified; the round-2 QA run again stops at the sign-in page. "Follow-ups for a human" is prose only — no `repoos new … --assigned-to human --hold` task was filed, and AGENTS.md requires the human-gated remainder be split before close-out. This is pass 1's second finding, still open (the QA-isolation finding is genuinely fixed: the real registry's mtime is unchanged across the rerun).
- **Class: test-host scratch cleanup** — `macos/RepoOSHub/ServerRegistryStore.swift:119-124` returns `temporaryDirectory/RepoOS Hub-xctest-<pid>` but nothing ever removes it; the test host demonstrably saves the registry on launch, so every `xcodebuild test` leaves a new directory behind. The sibling registry tests clean up in `tearDownWithError`; this is the only instance.

No further findings of this class were found after grepping: `ServerRegistryStore.applicationSupportDirectory`, `HubAppState` init/save call sites, `ServerWebsiteDataStorePool`, `ServerRegistryStoreTests`, `macos/README.md` isolation recipe, and the QA doc's Checked/Fixed sections. No new `node`/`npm`/`npx` invocation appears in the diff.

## Edge cases
- The production path now keys off `XCTestConfigurationFilePath`; a normal app launch from an environment carrying that variable silently switches to a throwaway registry ("my servers disappeared"). Gate on a test-bundle signal or document the trade-off.
- PID reuse could make a later test run inherit an earlier scratch directory; a UUID or per-run directory avoids it.
- The direct-exec launch with no content window remains unexplained; record whether a window existed (CGWindow bounds), since this may be activation rather than a crash.
- Round 2's report now exists (`work/reports/1169/round-2.json`, source `82800b8`) and matches the reviewed code, so the stale-report warning is resolved.

## Suggestions
- Attach the window-only PNGs with `repoos update 1169 --screenshot …`; that lands in gitignored `.attachments/`, so the pre-commit 4 MiB scan is not a reason to discard them (the current doc's justification confuses committing with attaching).
- The `[[shot.targets]]` Hub row documented in `docs/macos-hub-snapshots.md` is absent from `repoos.toml`, which is why this Hub diff got `shots: skipped`; a human-owned config follow-up would restore automatic Hub captures.
- File the held human task for the sign-in/projects-and-tasks check before Move to done.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

