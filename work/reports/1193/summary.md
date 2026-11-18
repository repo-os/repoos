## TL;DR

QA second pass over the macOS Hub app (Task 1193) verified the menu bar, Add Server sheet, server context menu and edit form, Cmd-K quick switcher, relaunch persistence, and Light/Dark appearances. No product defect was found, so the only change shipped is the QA record `docs/qa/2026-11-macos-hub-second-pass.md` (+27/−0). Review passed on the first round ("good to go") and the task landed in under 10 minutes of wall-clock time. Signed-in task search remains explicitly unverified and stays with human task #1174.

## Outcome

The task's goal was a second QA pass over flows that task #1169 (build, launch, first-run) had not covered. The engineer built the Debug target with `xcodebuild` (`CODE_SIGNING_ALLOWED=NO`, dedicated derived-data path), ran the native test suite, then drove the requested flows interactively against a live `repoos` server in a disposable Hub registry (`REPOOS_HUB_SUPPORT_DIRECTORY` under the user's cache root), so the everyday application registry was never touched.

Observed results, all recorded in the QA doc:

- **Menu bar:** File menu exposes New RepoOS Window, Add Server, Close, Close All.
- **Add Server:** the native sheet's "Running locally" discovery found the live service at `localhost:7171`; selecting it filled the address field; submitting performed the health check and produced a selected, healthy sidebar entry.
- **Edit flow:** the server row's context menu offered the expected actions (including Copy URL and Edit server); the edit sheet exposed display name, origin, group, SF Symbol, accent color and pin controls. Changing the name to `RepoOS QA` and group to `Second pass` saved and showed in the sidebar, still healthy — written only into the disposable QA registry.
- **Relaunch persistence:** after quitting and relaunching with the same support-directory override, the sidebar restored `RepoOS QA` as selected and healthy, and the JSON registry retained the edited name, group and selected server ID.
- **Cmd-K quick switcher:** opened from the main window, contained the saved server, its recent contexts and Add server; searching `repoos` returned local matches, searching `1193` returned No matches (the embedded web view was at the sign-in page, so this establishes empty-state behavior only, not signed-in task search).
- **Appearances:** Settings offered System, Light and Dark Hub themes; both explicit appearances were inspected and stayed legible.

The native XCTest run finished with **191 passed, 7 skipped, 0 failed**. Screenshots were captured window-only via `screencapture -l<windowid>` and kept out of the repository, per the task's rules.

**Final verdict:** review pass 1 returned **good to go** on 2026-11-18T18:26:07Z; the task closed out successfully (gate completed in 67s, status done, release:success, merged commit `5333cd088a0fa07fdd4aa01ad0e4cdbad2747a2f`). Because no defect surfaced, no source code changed — the deliverable is the observed-results record itself.

## Process stats

- **Engineering rounds:** 1 (round 1, 2026-11-18T18:25:46Z, agent `codex`, model `gpt-6-luna`).
- **Review rounds:** 1 (pass 1, verdict good to go, agent `codex`, model `gpt-6-luna`).
- **Restarts or model swaps:** none recorded.
- **Wall-clock, task start → done:** 2026-11-18T18:17:35Z → 2026-11-18T18:27:22Z, i.e. 9 minutes 47 seconds.
- **Session times (as recorded):** engineer 415s; reviewer 19s; two routing calls at 1s each; close-out gate 67s.
- **Tokens:** engineer 4,706,524; reviewer 93,336; combined 4,799,860 (sum of the two recorded figures). Routing-session tokens not recorded.
- **Cost:** not recorded (shown as "—" in the sessions table).

## What went wrong

Nothing blocked the task; all issues were warnings or scope boundaries, each resolved by recording rather than code change:

- **Xcode framework mismatch:** the local Xcode reported CoreSimulator `1051.55.0` as older than the `1174.21.0` the build expected, plus a CoreDevice symbol-loading error. This did not prevent the macOS build, the test run, or the interactive flows; it was noted in the QA record and no action was taken.
- **AppKit constraint-conflict warnings in tests:** XCTest emitted constraint conflicts from `HubFindBarContainerTests`. The interactive Cmd-K quick switcher showed no corresponding visual or functional fault, so the warnings were recorded for possible future investigation rather than treated as a product bug.
- **Authentication boundary:** the embedded web view sat at the sign-in page, so signed-in project/task search could not be exercised. Rather than fabricate evidence or claim the empty result as a pass, the engineer recorded the limit and left signed-in verification to the pre-existing human task #1174, exactly as the task body instructed. This is a scope limitation, not a failure.
- **Shot capture skipped at handoff:** the server noted the diff (3 changed paths) touches no capture target's globs — expected, since the only change is a docs file.

No failed handoffs, flaky checks, or restarts occurred.

## Learnings

- **QA registry isolation works and must stay mandatory:** giving the Hub process a disposable `REPOOS_HUB_SUPPORT_DIRECTORY` — including on relaunch — prevented any mutation of the person's real server registry while still exercising real persistence. This belongs in the macOS QA conventions in `docs/` (the QA record reiterates it; a durable pointer in the QA checklist would keep future passes from relying on memory).
- **First-run Add Server is coherent end-to-end** when driven through the real native sheet: discovery fills the origin, health is checked before saving, and the row lands healthy. Worth keeping in `docs/qa/` as the baseline for future regressions.
- **Relaunch persistence is verified at the registry level,** not just visually: the JSON registry retained the edited name, group and selected server ID after a full quit/relaunch.
- **Record authentication boundaries precisely:** when a task explicitly assigns signed-in verification to a human-owned task, state that an unauthenticated "No matches" is empty-state evidence, never task-search evidence. This is a general QA-reporting rule worth a line in the agent UI/QA conventions docs.
- **Keep DerivedData and screenshot outputs outside the worktree** for macOS QA; the task-asset guard and repo hygiene both depend on it.

## Follow-ups

None recorded. (Signed-in project/task validation was already owned by existing human task #1174 before this task started; no new tasks were filed from issues met along the way. The AppKit constraint warnings from `HubFindBarContainerTests` are recorded in the QA doc as candidates for future investigation if they ever correspond to a reproducible UI fault.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
