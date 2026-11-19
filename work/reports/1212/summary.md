## TL;DR

Task #1212 was a QA copy review of user-facing wording across the web app, mobile Hub and macOS Hub. The engineer replaced jargon-heavy error copy (a shell command leaked into a web connection error; "HTTP" phrasing in macOS server errors) with plain English, tied the wording into shared production constants so tests assert the real user-facing string, documented the review in `docs/qa/2026-11-copy-review.md`, and added a declared error-state UI shot. It took 2 engineering rounds and 3 review passes to reach "good to go"; the task is done and merged (commit `63530dd`). Mobile needed no changes — its discovery and HTTPS messages were already plain and actionable.

## Outcome

What shipped, in plain English:

- **Web app (`src/ui-app`):** the generic network-failure message in `api.ts` no longer tells users to restart the server with a shell command; it now says "Start the server, then reload," keeping the "RepoOS server" name. The message was extracted into an exported `SERVER_UNREACHABLE_MESSAGE` constant, and the recovery-banner test, API test and failed-load preview fixtures now import that constant, so a future regression of the user-facing copy cannot silently pass tests that only asserted a local fixture string.
- **macOS Hub (`macos/RepoOSHub`):** the health-check error dropped the "HTTP" acronym (keeping the numeric status for support), and the same plain "server returned an error" wording was applied to the web-view status title ("Server error (503)") and both Hub fetch clients (summary and task search). A navigation-policy test asserts the user-facing title.
- **Documentation:** `docs/qa/2026-11-copy-review.md` records what was checked, what changed, and why terms like "worktree" and "artifact" were deliberately retained (they appear on task/developer screens where the underlying concept matters). It also records the agreed vocabulary: "server" for the RepoOS instance, "project" for the repository it serves, and "runner" and "agent" as distinct roles never conflated.
- **UI evidence:** a declared `/work?shotState=work:failedLoad` shot with the error panel highlighted, replacing an earlier stale capture that showed a loading state.

Final verdict: review pass 3 returned **good to go**; the task closed out successfully (status done, release success) and merged to main as commit `63530ddb688e0efe673cf7971406412c6b2c0354`.

## Process stats

- **Engineering rounds:** 2 (round 1 committed 2026-11-19T00:58:16Z; round 2, addressing review findings, committed 2026-11-19T02:10:43Z).
- **Review passes:** 3 — pass 1 "needs some work" (00:59:00Z), pass 2 "needs some work", stale-evidence-only (01:25:29Z), pass 3 "good to go" (02:16:55Z).
- **Wall-clock, start to done:** created 2026-11-19T00:47:39Z, done 2026-11-19T02:34:02Z — 1 hour 46 minutes 23 seconds.
- **Agents and models:** all sessions ran on agent `codex` with model `gpt-6-luna`. Engineer: 1 session (started 00:47:47Z, elapsed 2458s, 22,621,133 tokens). Reviewers: 3 sessions on the `reviewer` agent (41s / 265,522 tokens; 33s / 228,727 tokens; 366s / 323,921 tokens — 818,170 reviewer tokens total). No model swaps. Reviewer session costs are not recorded ("—").
- **Restarts:** one watchdog restart of the engineer (01:16:01Z) and one adoption of an orphaned engineer process (pid 18646, 01:26:14Z). Routing sessions (6, model "unknown", 0–2s each) are bookkeeping; token/cost totals for them are not recorded.

## What went wrong

- **Stale test fixture (review pass 1):** the recovery-banner test hard-coded the revised message and asserted the fixture, so it would pass even if the production string regressed; the macOS web-view title still said "HTTP". Resolved in round 2 by the shared `SERVER_UNREACHABLE_MESSAGE` constant and consistent macOS wording.
- **Stale UI capture (review pass 2):** the automatic capture matched `/` on an earlier tree and showed a loading state, verifying neither changed message. The verdict was stale-evidence-only. Resolved by declaring the `work:failedLoad` error-state shot, which pass 3 confirmed rendered the intended panel.
- **Watchdog restart + orphaned process (01:16–01:26Z):** a queued message waited 3 minutes with no live engineer process, so the watchdog restarted the engineer; shortly after, an orphaned engineer pid (18646) was adopted. Both resolved by the system; no work was lost.
- **Turn ended without handoff (01:40:44Z):** the engineer's turn exited cleanly while a full remote check was running, explicitly to let a queued message be delivered; a handoff was then requested via CLI.
- **Handoff refused (01:58:25Z):** the worktree changed while the handoff gate was running (five new/changed UI test and fixture files appeared), so the check result no longer described the committed tree. Nothing was lost; the engineer resumed, and the next handoff (02:10:43Z) succeeded.
- **Handoff deferred (02:07:13Z):** a queued message had to be read before review; the engineer was resumed and the handoff re-requested within seconds.
- **Shot capture cancelled (01:25:40Z):** the automatic browser capture was cancelled during pass 2's cycle; superseded by the later engineer-made capture, which pre-empted the automatic one at the next handoff.
- **Merge-tree check could not run (passes 1 and 2):** Git was denied permission to create a temporary file. Not a code problem; the server's landing checklist showed only the task's own work-file conflicts with main, which close-out resolves from main. Pass 3 closed out normally.
- Several CTO nudges were held (already-queued message, remote validation running, handoff gate running) — normal throttling, not failures.

## Learnings

- **Copy tests should assert the production string, not a local fixture.** Extracting user-facing error copy into a shared exported constant ties the API, recovery UI and preview fixtures to one source of truth. Durable enough for `AGENTS.md` or `docs/agent-ui-and-preview-conventions.md` (a one-line rule: "error copy asserted in tests should come from the exported production constant").
- **Review evidence must show the completed state.** A capture of a loading screen on an earlier tree verifies nothing; declaring an error-state route/fixture up front (`work:failedLoad`) makes the shot meaningful. This reinforces the existing shots guidance in `docs/agent-ui-and-preview-conventions.md`.
- **A shared plain-language error class should be applied to sibling paths.** Fixing one macOS "HTTP" error surfaced the same wording in the web-view title and both fetch clients; searching neighboring status-handling paths after a finding is worth doing by default.
- **Jargon removal is judgment, not find-and-replace.** Many hits for "endpoint/payload/worktree" are internal identifiers or advanced-screen vocabulary where precision helps; the QA doc records the retained terms and why. The `docs/qa/2026-11-copy-review.md` format is a good template for future copy-review QA passes.
- The recurring pattern of "queued message waited 3m with no live process" and orphaned engineers worked as designed here, but two such events in one short task is worth a look in `docs/agent-debugging-and-incidents.md` if it repeats.

## Follow-ups

None recorded.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
