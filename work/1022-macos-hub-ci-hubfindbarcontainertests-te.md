---
id: 1022
title: "macOS Hub CI: HubFindBarContainerTests.testHidingFindBarReturnsFocusToThePage fails on every run; the Build and test native Hub job has been red since at least 2026-10-19"
type: bug
status: ready
priority: p1
area: macos
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-04T03:59:44Z"
updated_at: "2026-11-04T19:54:21Z"
---
## Problem
The "macOS Hub" GitHub Actions workflow (job "Build and test native Hub", step "Run unit tests without signing") ends in failure on every run I can see, from 2026-10-19 through the v0.5.75 release on 2026-11-04 (run https://github.com/repo-os/repoos/actions/runs/41769376401; also the v0.5.74 release run on 2026-10-30). The log shows one failing test, `HubFindBarContainerTests.testHidingFindBarReturnsFocusToThePage()`, failing in 0.000 s on the CI runner; the other tests in that suite pass. It looks like a keyboard-focus / first-responder test that cannot hold focus on a headless CI runner, but the assertion text has not been read. The result: the release page warns "The release workflow failed at 'Run unit tests without signing', so some channels below may not update on their own", even though the Release workflow and the "Release macOS Hub DMG" job succeed and the release is published. A permanently red job hides real regressions.

## Desired UX
The "Build and test native Hub" job is green when the app is healthy and red only for real failures, and a release shows no failure warning from it.

## Acceptance criteria
- [ ] Read the assertion output for `testHidingFindBarReturnsFocusToThePage` (`gh run view <id> --log-failed`) and find out why it fails on CI but not locally; confirm whether it fails on every run.
- [ ] Fix the test so it passes on the CI runner (for example host the view in a real window and make it key, or assert on the responder chain directly), or move it to a clearly separated local-only suite with a documented reason. Do not simply delete it or mark the whole job non-blocking.
- [ ] Check the rest of the job for other latent failures once this one is green (for example the Swift concurrency warnings in `LocalServerDiscoveryTests.swift` around lines 166, 240-298).
- [ ] The macOS Hub workflow passes on a push to main.
- [ ] Note in `docs/` (where the macOS CI is described) why the test was failing and what changed.

## Notes for AI
This needs a macOS runner to confirm: the fix cannot be fully verified locally in a headless way, so say what was and was not run. If any acceptance criterion needs a real device, account or signing identity, say so instead of claiming it works (see AGENTS.md "Never close out human-gated work").

## Activity

- 2026-11-04T03:59:44Z · created · njachowski@gmail.com
- 2026-11-04T17:43:46Z · status inbox→ready
- 2026-11-04T19:54:18Z · cli_override
- 2026-11-04T19:54:21Z · model_override
