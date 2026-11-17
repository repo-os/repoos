---
id: "1153"
title: "Hub 'Find servers on my tailnet': stop listing bare machines, hide phones, explain failures, and replace SSH discovery with an HTTPS-based one"
type: bug
status: review
priority: p2
area: [mobile, server, core]
assigned_to: ai
created_by: t@t
branch: feat/hub-find-servers-on-my-tailnet-stop-list
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T10:06:23Z"
updated_at: "2026-11-17T16:42:49Z"
last_handoff_failure_fingerprint: "check|remote validation failed: test failure: tests/check-docs-only-cli.test.ts > cmdCheck docs/bookkeeping shortcut (#1059) > classifies a work-only diff and skips the full suite on thinkpad — fix it in the feature branch and re-run the gate"
last_handoff_failure_sha: e1b1e693693ec27e46b2e70d284ec6202a069a30
review_passes: 5
review_rounds: 2
dev_error_count: 5
deferred_handoff_resume_count: 1
---
## Problem

On Nick's phone (Hub, screenshots attached in chat) 'Find servers on my tailnet' lists Tailscale MACHINES (air, Peck's Mac mini, Nothing Phone (3a), muse) as 'Unreachable — timed out' rows next to the real RepoOS servers it found (tiao, tuk-driver on bee). Nick can SSH to thinkpad, bee and mini from his Mac (air), so this looks broken.

Cause (from code, src/core/tailnet-servers.ts + mobile/src/tailnet.ts): discovery runs on ONE server the phone asked (GET /api/servers/tailnet). That server lists online Tailscale peers and SSHes into each to run `repoos servers --json` (4s per host, 8s whole pass). SSH is pairwise: it needs THAT machine's key and the peer's Remote Login enabled. Working from air does not mean working from thinkpad or bee. A failed SSH falls back to a row named after the machine, so the screen shows machines, not projects. A phone ('Nothing Phone (3a)') slipped past isUnsupportedMobilePeer. air runs a saved 'repoos' server but its row is 'unreachable' rather than 'already saved'. 'timed out' may also just be the shared 8s deadline, not a real SSH timeout. `repoos servers --tailscale` from air works because air has the keys (it lists local, bee x2, thinkpad x2; muse fails with 'ssh: connect to host muse port 22: Connection refused'), so the CLI has the same limit: it only sees machines the CURRENT machine can SSH into.

## Desired UX

- The Hub screen shows RepoOS projects first. Machines that could not be checked go in a separate collapsed 'Couldn't check these machines' group, each with the real reason and one plain fix ('SSH is off on muse', 'no SSH key from thinkpad', 'timed out').
- Phones, tablets and other non-server devices are never listed.
- A machine that already hosts a saved server shows as saved, never as unreachable.
- Discovery does not depend on SSH keys between machines. Preferred design: each RepoOS server exposes a small tailnet-only discovery endpoint (name, port, tailscale HTTPS URL, project) and the asking server probes online peers over HTTPS/HTTP with a short parallel timeout on a well-known discovery port (or a machine-level listener that lists every RepoOS server on that machine, so one port per machine is enough). SSH stays as an optional fallback for older servers.

## Acceptance criteria

- [ ] On a tailnet like Nick's (air, bee, thinkpad, mini, muse, a phone), the Hub screen lists every running RepoOS project with its HTTPS URL, with no bare machine rows among the results.
- [ ] Machines that could not be checked appear only in a collapsed group with a specific reason; phones are excluded (fix isUnsupportedMobilePeer for 'Nothing Phone' style names using the peer OS/tags from tailscale status).
- [ ] A machine hosting a saved server is shown as saved.
- [ ] Discovery works with no SSH keys between machines, proven by a test that fakes the HTTP discovery responses, and the shared 8s deadline no longer turns healthy-but-slow hosts into 'timed out'.
- [ ] `repoos servers --tailscale` uses the same discovery (src/core stays the single implementation) and prints the same reasons.
- [ ] Older servers without the discovery endpoint still work through the SSH fallback, and say so plainly when they can't be listed.
- [ ] User docs and mobile/README.md are updated.

## Notes for AI

Do not add runtime dependencies. The discovery endpoint exposes names/ports only (no tokens or paths beyond the project root name) and must be reachable only over the tailnet. Reuse parseTailnetInfo and the existing result shape so mobile/src/tailnet.ts changes stay small.

## Activity

- 2026-11-17T10:06:23Z · created · t@t
- 2026-11-17T10:23:21Z · cli_override, model_override
- 2026-11-17T10:23:24Z · status inbox→ready
- 2026-11-17T10:23:25Z · status ready→active, branch
- 2026-11-17T10:23:30Z · agent exited with an error (cursor) · Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable. Open Raw CLI error for details. (CLI: Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.)
- 2026-11-17T10:23:30Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable. Open Raw CLI error for details. (CLI: Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY envir…
- 2026-11-17T10:23:32Z · needs_input
- 2026-11-17T10:23:33Z · agent exited with an error (cursor) · Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable. Open Raw CLI error for details. (CLI: Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.)
- 2026-11-17T10:23:33Z · engineer crash recovery: resuming cursor + composer-2.5 (2/3 crashes in 30m) · Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable. Open Raw CLI error for details. (CLI: Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY envir…
- 2026-11-17T10:23:35Z · needs_input
- 2026-11-17T10:23:36Z · agent exited with an error (cursor) · Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable. Open Raw CLI error for details. (CLI: Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.)
- 2026-11-17T10:23:36Z · engineer crash recovery: surfaced instead of switching — a human-set task override (cursor + composer-2.5) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-11-17T10:33:51Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-17T10:33:52Z · agent exited with an error (cursor) · Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable. Open Raw CLI error for details. (CLI: Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.)
- 2026-11-17T10:33:52Z · engineer crash recovery: surfaced instead of switching — a human-set task override (cursor + composer-2.5) is pinned, so RepoOS did not replace it (4/3 crashes in 30m)
- 2026-11-17T10:44:06Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-17T10:44:07Z · agent exited with an error (cursor) · Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable. Open Raw CLI error for details. (CLI: Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.)
- 2026-11-17T10:44:07Z · engineer crash recovery: surfaced instead of switching — a human-set task override (cursor + composer-2.5) is pinned, so RepoOS did not replace it (5/3 crashes in 30m)
- 2026-11-17T10:53:30Z · cli_override, model_override
- 2026-11-17T10:53:32Z · needs_input
- 2026-11-17T11:05:38Z · body
- 2026-11-17T11:09:35Z · body
- 2026-11-17T11:15:03Z · body
- 2026-11-17T11:16:22Z · status active→review
- 2026-11-17T11:16:23Z · message_queued at 2026-11-17T11:16:23.054Z
- 2026-11-17T11:16:23Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-17T11:26:05Z · note: review pass 1: needs some work
- 2026-11-17T11:26:05Z · message_delivered: 1 message(s)
- 2026-11-17T11:26:05Z · status review→active
- 2026-11-17T11:37:22Z · body
- 2026-11-17T11:41:22Z · note: adopted orphaned engineer pid 43358
- 2026-11-17T11:41:37Z · body
- 2026-11-17T11:43:08Z · status active→review
- 2026-11-17T11:43:09Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-17T11:54:23Z · message_queued at 2026-11-17T11:54:23.842Z
- 2026-11-17T11:54:24Z · note: review pass 2: needs some work
- 2026-11-17T11:54:24Z · message_delivered: 1 message(s)
- 2026-11-17T11:54:24Z · status review→active
- 2026-11-17T12:56:33Z · body
- 2026-11-17T12:58:35Z · status active→review
- 2026-11-17T12:58:35Z · message_queued at 2026-11-17T12:58:35.477Z
- 2026-11-17T12:58:35Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-17T13:02:47Z · note: review pass 3: needs some work
- 2026-11-17T13:02:48Z · needs_input
- 2026-11-17T13:10:13Z · status review→active
- 2026-11-17T13:10:15Z · watchdog: restarting engineer because a queued message waited 12m with no live process
- 2026-11-17T13:10:15Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T13:10:17Z · message_delivered: 1 message(s)
- 2026-11-17T13:10:17Z · message_queued at 2026-11-17T13:10:17.732Z
- 2026-11-17T13:17:15Z · queued message undelivered for 7m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T13:17:15Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The requested `repoos check` has started in changed-path mode and is uploading the checkpointed tree for the configured remote validation runner. The focused discovery tests are green after updating the conflicting legacy expectation; I’m … · stderr: Reading additional input from stdin... 2026-11-17T13:11:58.636177Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/hub-find-servers-on-my-tailnet-stop-list/src/server/tailnet-discovery-listener.ts: Promise.resolve(getT…
- 2026-11-17T13:17:15Z · status active→review
- 2026-11-17T13:17:15Z · message_delivered: 1 message(s)
- 2026-11-17T13:17:16Z · note: handoff requested (cli)
- 2026-11-17T13:21:55Z · CTO nudge: held — handoff gate is running
- 2026-11-17T13:30:11Z · message_queued at 2026-11-17T13:30:11.359Z
- 2026-11-17T13:30:11Z · handoff failed · task-file handoff failed at check · repoos check failed: tests — ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
- 2026-11-17T13:30:39Z · note: adopted orphaned engineer pid 74706
- 2026-11-17T13:35:38Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T13:35:38Z · queued message undelivered for 5m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T13:35:53Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: That failure is environmental: the test assumes Tailscale is absent, but this machine has a live Tailscale IP, so `resolveServeHost` correctly selects `0.0.0.0`. I’ll make the host detector injectable and have the test explicitly model “no… · stderr: 2026-11-17T13:18:31.218232Z ERROR codex_core::tools::router: error=Exit code: 1 Wall time: 0 seconds Output: Failed to write file /Users/nick/code/nick/repoos-worktrees/feat/hub-find-servers-on-my-tailnet-stop-list/src/server/tailnet-discovery-listener.ts 2026-11-17T13:21:49.207576Z ERROR codex_models_manager::manager…
- 2026-11-17T13:35:54Z · status active→review
- 2026-11-17T13:35:54Z · message_delivered: 1 message(s)
- 2026-11-17T13:35:54Z · note: handoff requested (cli)
- 2026-11-17T13:40:38Z · CTO nudge: held — handoff gate is running
- 2026-11-17T13:49:33Z · message_queued at 2026-11-17T13:49:33.289Z
- 2026-11-17T13:49:33Z · handoff failed · task-file handoff failed at review · Engineering report draft is missing: .repoos/engineering-report-drafts/1153.md
- 2026-11-17T13:50:38Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T13:51:17Z · body
- 2026-11-17T13:54:40Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-17T13:54:40Z · message_queued at 2026-11-17T13:54:40.425Z
- 2026-11-17T13:54:40Z · ↻ resuming engineer to read queued message
- 2026-11-17T13:54:40Z · status active→review
- 2026-11-17T13:54:40Z · message_delivered: 2 message(s)
- 2026-11-17T13:54:41Z · note: handoff requested (cli)
- 2026-11-17T13:55:17Z · status active→review
- 2026-11-17T13:55:17Z · message_queued at 2026-11-17T13:55:17.423Z
- 2026-11-17T13:55:17Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-17T14:00:16Z · note: review pass 4: needs some work
- 2026-11-17T14:00:16Z · needs_input
- 2026-11-17T14:10:01Z · status review→active
- 2026-11-17T14:10:02Z · needs_input
- 2026-11-17T14:10:02Z · message_delivered: 1 message(s)
- 2026-11-17T14:24:32Z · message_queued at 2026-11-17T14:24:32.938Z
- 2026-11-17T14:25:37Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T14:27:39Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-17T14:27:40Z · message_delivered: 1 message(s)
- 2026-11-17T14:45:38Z · message_queued at 2026-11-17T14:45:38.068Z
- 2026-11-17T14:45:38Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-17T14:50:24Z · queued message undelivered for 5m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T14:50:24Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The focused tailnet and CLI tests now pass (51 tests). The prior full run’s remaining failures were stale timeout expectations after extending the probe budget and a saved custom-domain case that should be reported as saved; I’ve updated b… · stderr: Reading additional input from stdin... 2026-11-17T14:30:09.259029Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/hub-find-servers-on-my-tailnet-stop-list/src/ui-app/tests/tailnet-peer-discovery-route.test.ts: expect(…
- 2026-11-17T14:50:24Z · message_delivered: 1 message(s)
- 2026-11-17T14:50:38Z · message_queued at 2026-11-17T14:50:38.057Z
- 2026-11-17T14:50:38Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-17T14:50:38Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The relevant check passed, and I already ran `repoos mv 1153 review`. The handoff request is recorded; RepoOS will finalize it after this turn ends. · stderr: (empty)
- 2026-11-17T14:50:38Z · message_delivered: 1 message(s)
- 2026-11-17T14:50:43Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Verification passed and the handoff was already requested with `repoos mv 1153 review`. No long-running step remains. · stderr: (empty)
- 2026-11-17T14:51:00Z · note: handoff requested (cli)
- 2026-11-17T14:55:38Z · CTO nudge: held — handoff gate is running
- 2026-11-17T15:11:59Z · note: ui verification passed: 1 shot captured with clean console (1 shot warning)
- 2026-11-17T15:12:00Z · status active→review
- 2026-11-17T15:12:00Z · message_queued at 2026-11-17T15:12:00.826Z
- 2026-11-17T15:20:38Z · note: review pass 5: needs some work
- 2026-11-17T15:20:38Z · needs_input
- 2026-11-17T15:51:12Z · status review→active
- 2026-11-17T15:51:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T15:51:15Z · needs_input
- 2026-11-17T15:53:49Z · message_delivered: 1 message(s)
- 2026-11-17T16:10:38Z · message_queued at 2026-11-17T16:10:38.304Z
- 2026-11-17T16:10:38Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-17T16:15:12Z · queued message undelivered for 5m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T16:15:12Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The failing test passed when isolated (1 passed, 16 skipped), which points to a suite-load timeout rather than a deterministic regression. I’m rerunning the requested changed-path check so the handoff has a green full result. · stderr: 2026-11-17T15:56:54.615843Z ERROR codex_core::tools::router: error=Exit code: 1 Wall time: 0 seconds Output: Failed to write file /Users/nick/code/nick/repoos-worktrees/feat/hub-find-servers-on-my-tailnet-stop-list/src/ui-app/tests/tailnet-peer-discovery-route.test.ts
- 2026-11-17T16:15:13Z · note: handoff requested (cli)
- 2026-11-17T16:15:38Z · CTO nudge: held — handoff gate is running
- 2026-11-17T16:18:46Z · message_delivered: 1 message(s)
- 2026-11-17T16:38:35Z · message_queued at 2026-11-17T16:38:35.024Z
- 2026-11-17T16:38:35Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/check-docs-only-cli.test.ts > cmdCheck docs/bookkeeping shortcut (#1059) > classifies a work-only diff and skips the full suite on thinkpad — fix it in the feature branch and re-run the gate
- 2026-11-17T16:40:38Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T16:41:08Z · body
- 2026-11-17T16:42:49Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-17T16:42:49Z · message_queued at 2026-11-17T16:42:49.320Z
- 2026-11-17T16:42:49Z · ↻ resuming engineer to read queued message
- 2026-11-17T16:42:49Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The retry is green: all 739 test files passed (9,902 tests; 14 skipped), and the UI smoke, contrast audit, and user-docs build passed. I’m confirming the report draft and current task state, then I’ll request handoff. · stderr: 2026-11-17T16:18:48.337629Z ERROR codex_core::util: Custom tool call output is missing for call id: call_2175e259c1ed429398dd7a25f50ebd04 2026-11-17T16:18:52.422107Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 64565 2026-11-17T16:18:52.453534Z ERROR codex_core::util: Custom tool call …
- 2026-11-17T16:42:49Z · status active→review
- 2026-11-17T16:42:49Z · message_delivered: 2 message(s)
