---
task: 1022
pass: 1
at: "2026-11-04T20:09:14.671Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/macos-hub-ci-hubfindbarcontainertests-te
state: ok
tree_identity: "f7faab479:"
---
## Verdict
`needs some work` — the focus assertion is too permissive: the test can pass with focus still in the hidden find bar, so it cannot catch the regression it guards.

## Relevance
`still relevant` — the macOS Hub job has been red since 2026-10-19 and no other fix for this test has landed on `main`.

## Evidence
None

## Bugs
- **Test assertion too permissive (false-pass regression test)** — `macos/RepoOSHubTests/HubFindBarContainerTests.swift:107-110` and `:121-125`. Both new assertions use `containsKeyboardFocus(in:)`, whose final fallback returns true for `responder === self` or any descendant of the container (`macos/RepoOSHub/HubServerWebContainerView.swift:109`). The find bar is a subview of the container and AppKit installs the shared field editor in the content view (also the container), so the post-hide assertion still passes if `hideFindInterface()` never moves focus to the web view. The pre-hide assertion’s message (“the find field must hold focus”) is likewise satisfied by page focus. The local pre-fix xcresult shows the old failure was the teardown crash, not the strict assertion, so `window.firstResponder === container.webView` (which production explicitly sets) can remain. Assert that after the handoff, and check the pre-condition precisely (field editor’s delegate is `findBar.searchField`). The doc’s “keeps the same product assertion” is inaccurate for the same reason.

## Edge cases
- CI is not yet confirmed: the workflow only runs on a push to `main`, and the engineer did not re-run it. The local xcresult does show the new test passing (0.53 s) and the old crash reproducing, so the teardown fix is credible; acceptance criterion “workflow passes on a push to main” remains post-merge.
- The new test still needs `makeKeyAndOrderFront`/`makeFirstResponder` to install the field editor headlessly. The old test’s strict assertion passed on CI before the teardown crash, so this is likely fine.

## Suggestions
- The local `LocalServerDiscoveryTests` failures are not a “broken CoreDevice toolchain”: `~/.repoos/servers` contains `7171`/`7405`, and the default live registry makes `shouldRunPortScan` false, returning those real ports. Injecting `registrySource: .empty` (or a temp dir) would make those tests hermetic; CI has no registry, so they pass there. Pre-existing, not introduced here.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

