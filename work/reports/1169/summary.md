## TL;DR

Task #1169 was a QA pass on the macOS RepoOS Hub app: build it, launch it, discover and connect to a server, and fix whatever broke. The Hub built and ran; the QA run exercised first-run, server discovery, add-server, connection and the sign-in page, and found one real defect — the XCTest test host wrote to Nick's real Hub registry because it inherited the normal Application Support path. That was fixed with a per-process temporary support directory for XCTest (explicit `REPOOS_HUB_SUPPORT_DIRECTORY` override still wins), with cleanup at test-host termination and tests covering resolution, cleanup and cleanup-error propagation. The QA record lives in `docs/qa/2026-11-macos-hub-qa.md`. Signed-in Projects and Tasks could not be verified because automated email-code entry never reached the signed-in web UI; that check was split into human task #1174 and is explicitly recorded as unverified. The task took 19 engineering rounds and 12 review passes before five consecutive "good to go" verdicts; much of the elapsed time was consumed by handoff-gate failures, watchdog restarts and a missing engineering-report draft. The task is done (merged commit `aa6d60da646ae4dee2bd240365911d702e9aae6f`).

## Outcome

- Built the macOS Hub with `xcodebuild` (`CODE_SIGNING_ALLOWED=NO`, task-specific DerivedData path) and ran its XCTest suite; the recorded runs passed (188 cases in round 1, 189 after the added tests).
- Launched the app via LaunchServices with an isolated support directory and drove, with window-only captures (`screencapture -l<windowid>`, never full-screen): first-run empty state, discovery of the live `localhost:7171` server, add-server with health check, registry persistence in the isolated `servers.json`, and rendering of the connected sign-in page. No crash, blank or broken screen was found on those paths.
- Fixed the one real bug found: an `xcodebuild test` test host run at 02:22:55Z rewrote Nick's real `servers.json` (recents and selected server; prior values unknown and not restored — documented in the QA record). The fix (`ServerRegistryStore.swift`) resolves a unique temporary support directory for XCTest processes unless an explicit override is set, removes it in `applicationWillTerminate`, logs cleanup failures, and is covered by table-driven resolution tests plus cleanup and error-propagation tests.
- Fixed test isolation in `src/ui-app/tests/servers-command.test.ts` (round 16): fake-peer tests were making real HTTP discovery requests to live tailnet services; deterministic `httpDiscovery: async () => null` stubs were added, after which the focused file passed all 15 cases.
- Merged current main into the branch (round 19, merge commit `7417f02d0b28f3b6ca1b59121bdbbece6e320578`), resolving duplicate `httpDiscovery` keys (TS1117) that broke the close-out build.
- Committed the QA record `docs/qa/2026-11-macos-hub-qa.md`, which lists what was checked, what was fixed, the one real-registry write and its limits, and the unverified screens.
- Final verdict: review passes 8–12 all returned `good to go` (passes 1–7 were `needs some work`). Status: done, `release:success`; close-out gate completed in 113 s.

**Out of scope / not verified:** signed-in Projects and Tasks. Automated email-code entry did not reach the signed-in web UI (synthetic clicks/keystrokes never reached the WKWebView email field). Human follow-up #1174 tracks this step; the QA record and task both say not to treat this criterion as complete until #1174 reports results. Also recorded as open: direct-executable launch showed a process but no content window during the observation window (unexplained, not a confirmed crash); stopped-server discovery, settings, command palette, notifications and WebKit OAuth were not exercised.

## Process stats

- **Wall clock:** created 2026-11-18T02:19:44Z → done 2026-11-18T17:20:41Z, i.e. 15 h 00 m 57 s span computed from those timestamps.
- **Engineering rounds:** 19. Rounds 1–2 ran on Claude Code / haiku; rounds 3–19 on Codex / gpt-6-luna. Rounds 5–15, 17 and 18 were largely re-verification and report-bookkeeping turns with "No changed files".
- **Review passes:** 12 — passes 1–2 by opencode / opencode-go/deepseek-v4.1-flash (`needs some work`), passes 3–12 by Codex / gpt-6-luna (passes 3–7 `needs some work`; passes 8–12 `good to go`).
- **Watchdog interventions (recorded):** 5 engineer restarts (queued-message waits of 8 m, 3 m, 16 m and no-live-process waits of 12 m and 42 m), 3 auto-resumes after clean exits without handoff (resumes 1/3 and 2/3 in one sequence, 1/3 in another), 9 "auto-surfaced stuck task" events, 1 dead reviewer session auto-retried (02:56:48Z) and then escalated to `needs_input` (03:01:58Z), 4 orphaned engineer PIDs adopted (18350, 49812, 5741, 90037) and 1 orphaned ssh run process stopped (pid 6360).
- **Handoff failures (recorded):** 9 refusals for "Engineering report draft is missing: `.repoos/engineering-report-drafts/1169.md`"; repeated refusals at check because the worktree changed while the gate was running (HEAD moved `113b674b` → `34fd29e7` via a "Merge main into task #1169" commit touching other QA docs); 1 remote-validation failure (`servers-command.test.ts`); 1 handoff deferred for unread queued messages. One engineer turn ended to deliver queued messages several times; one queued message went overdue (undelivered 60 m).
- **Tokens and cost:** task-wide totals are not recorded. Per-session figures recorded in the sessions table: engineer haiku 800 s, 41,823 tokens, $0.9699591899999999; engineer gpt-6-luna 2,682 s, 228,892,937 tokens, $0.9699591899999999 (the same cost value is recorded on both engineer rows); reviewer deepseek-v4.1-flash pass 1: 90,334,876 tokens, $0.018549288, pass 2: 76,831 tokens, $0.02435091; gpt-6-luna reviewer sessions recorded 111,640–262,121 tokens each with no cost figure. Router sessions recorded no tokens or cost.

## What went wrong

- **Real-registry mutation during testing.** The round-1 `xcodebuild test` run launched the app as a test host with no support-directory override, rewriting Nick's real `servers.json` at 02:22:55Z. Fixed in code (XCTest temp directory + cleanup + tests). The prior selected-server value was never captured, so it could not be restored; the QA record discloses this instead of claiming restoration.
- **XCTest scratch directories accumulated** (review pass 2): the first fix left per-PID temp registries behind. Resolved with a UUID-named directory removed at termination, cleanup errors surfaced, and focused tests.
- **Review stalled twice at the start:** the reviewer produced no report, the watchdog auto-retried (02:56:48Z), then escalated to `needs_input` (03:01:58Z); the task was returned to active at 03:17:45Z and the loop continued.
- **Nine handoff refusals for a missing engineering report draft.** RepoOS consumes `.repoos/engineering-report-drafts/1169.md` when finalizing a round report, so every subsequent attempt failed until the engineer learned to recreate a fresh draft per handoff. This alone burned several hours between 05:40Z and 15:10Z.
- **Repeated check-mismatch refusals:** a concurrent "Merge main into task #1169" commit moved HEAD while the gate ran, so the recorded check result no longer described the committed tree; the watchdog surfaced this as a stuck task 9 times before the worktree stabilized.
- **Remote validation failure at 12:46:59Z:** three `servers-command.test.ts` cases failed because the fake-peer tests hit live tailnet services. Fixed by injecting null HTTP-discovery stubs (round 16); the focused file then passed all 15 cases.
- **Close-out gate failure after merging main (round 19):** main had added a shared `noHttpDiscovery` helper that collided with the branch's inline stubs, producing duplicate-key TS1117 errors in six object literals. Resolved by keeping one deterministic stub per test and main's shared helper; the final full `repoos check` passed (753 test files, 10,073 tests passed, 14 skipped, plus UI smoke, rendered contrast and the macOS Hub icon transparency check), and the close-out gate completed in 113 s.
- **Reviewer sandbox limitation:** `git merge-tree --write-tree main HEAD` could not create a temporary file, so reviewers could not confirm mergeability directly; they relied on the landing checklist.
- **Human-in-the-loop gating:** review passes 1–7 repeatedly blocked on the signed-in Projects/Tasks criterion until the task spec was edited (14:17:46Z) to scope it out to #1174; `review-rounds-exhausted` needs-input was cleared twice by the human (13:47:29Z, 14:17:47Z).
- **Codex tooling errors:** several `apply_patch` verification failures editing the QA doc and report draft (lines not found), and one `write_stdin failed: Unknown process id 31261` — all recovered on retry without data loss.
- **Launch-path oddity:** direct execution of the app binary started a process but showed no content window during observation; LaunchServices (`open -n --env …`) worked. Recorded as unexplained, not a crash.

## Learnings

- **XCTest app hosts execute real app startup and can write normal user state.** Any app-host test run needs an explicit storage boundary in code (override-first, XCTest-temporary, normal-launch resolution), not just a documented launch recipe. Worth a line in `AGENTS.md`'s macOS conventions and in `macos/README.md` next to the isolation recipe.
- **Tests that exercise a network-capable path must inject deterministic results** when they assert a different transport; otherwise they make live requests (the `servers-command.test.ts` incident). This belongs in the repo's testing conventions doc.
- **The engineering report draft is consumed per handoff** — a fresh `.repoos/engineering-report-drafts/<id>.md` is required for every attempt, even after a good-to-go review with no code changes. Worth one line in `AGENTS.md`'s operating loop; the repeated missing-draft refusals cost more wall-clock than any code issue in this task.
- **A green scoped check is not acceptance evidence.** `repoos check --changed main` passing says nothing about a human-only product flow (signed-in screens). Keep engineering checks and acceptance evidence as separate claims.
- **A superseded handoff is not proof validation is running.** Confirm task status, handoff status and review freshness before resuming; restore state through RepoOS commands.
- **Reviewer rounds must bind their narrative to the exact checked source SHA**; a report describing an older tree does not substantiate the reviewed HEAD (flagged in passes 5, 6 and later).
- **Stale premises get caught:** review passes 1–2 noted #1155/#1167 had already exercised the Hub the day before; QA passes should check sibling tasks before claiming "nobody has driven it".
- The unexplained direct-exec no-window launch remains an open observation for anyone launching the Hub outside LaunchServices; a focused follow-up would belong in a new task if that launch mode is meant to be supported.

## Follow-ups

- **#1174** — Human verify signed-in macOS Hub projects and tasks: the one acceptance criterion this task could not close, because automated email-code entry never reached the signed-in web UI. A related task #1172 was created during round 3 but was not present in this worktree; #1174 is the tracker.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
