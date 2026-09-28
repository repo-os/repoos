---
id: "0537"
title: Add a notification provider registry and the Telegram notification provider
type: feature
status: review
needs_input: true
needs_input_reason: review-rounds-exhausted
needs_input_detail: The reviewer sent this back to the engineer 2 times and still found issues. Human review needed.
priority: p1
area: server
story: RepoOS Telegram Bot
assigned_to: ai
created_by: ""
branch: feat/add-a-notification-provider-registry-and
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-09-27T07:33:00Z"
updated_at: "2026-09-28T03:20:24Z"
review_passes: 3
review_rounds: 2
---
## Problem

Story #0003 says "Create a Telegram notification provider alongside the existing notification system." There is no existing system to sit alongside — **ntfy is a hardcoded set of free functions with no interface and no registry**, so Telegram has no seam to plug into and every call site would have to be rewritten by hand.

`src/server/ntfy.ts` is 157 lines of module-level functions: `shouldSend`, `publish`, `notifyStatusChange`, `notifyTaskCreated`, `notifyNeedsInput`, `notificationForStatusChange`, `formatNotification`. Config is three flat scalars — `ntfyEnabled`, `ntfyTopic`, `ntfyBaseUrl` (`src/core/types.ts:353`), one global topic per repo. Call sites are wired in `src/server/server.ts` (imports at `:183-184`, attached to the index stream at `:2009`) and `src/server/routes/notify.ts`.

Two properties of the existing code must survive the refactor:

- **Fire-and-forget.** `publish` does `void fetch(...)` and only `console.error`s failures. The doc comment states the intent: a network error "must never block or fail the status transition." A Telegram outage must not be able to fail a task transition either. This is the single most important invariant to keep.
- **`NotificationSpec` + `formatNotification` as the shared shape**, so a message's content is built once and rendered per provider rather than duplicated per provider.

## What to build

- A `NotificationProvider` interface, with ntfy reimplemented as one implementation **and no behavior change** — this is a refactor, and ntfy users must see no difference. Guard it with tests that pin current ntfy output.
- `telegram` as a second implementation, dispatching to **all** enabled providers. ntfy and Telegram running together is the expected end state, not an either/or.
- Per-project and per-chat configuration, which does not exist today. The nearest precedents for per-entity config are `boardColumns` and `tunnel.apps` (`SUPPORTED_TOML_KEYS`, `src/core/config.ts:1746`); Hub capabilities show the DB-row pattern for per-owner config with TTL and revocation. Notification routing belongs in a table keyed by chat, not in a new flat scalar.
- The story's event set: task created, task started, agent needs input, agent completed, moved to review, review feedback available, integration/merge failure, server or agent failure. Each carries repository name, task id and title, current status, a short summary, and a link into the web UI, with optional inline action buttons.

## Do not copy these ntfy traits

- `shouldSend` **logs on every call** (`src/server/ntfy.ts:93,98,101`) and is called inside `publish`, so every notification logs several times. Do not reproduce this in the new layer.
- ntfy's `NotificationPriority = "min" | "low" | "default" | "high" | "max"` is ntfy's vocabulary, not a portable one. Keep it inside the ntfy adapter; use a RepoOS-level severity in the shared interface and map on the way out.

## Done when

- ntfy output and delivery are unchanged by the refactor, pinned by test.
- Both providers dispatch from one call site; a Telegram failure is proven not to affect a status transition.
- Notifications route per chat, and only to bound chats.

## Activity

- 2026-09-27T07:33:00Z · created · unknown
- 2026-09-27T07:34:17Z · status inbox→ready
- 2026-09-27T15:42:33Z · body
- 2026-09-27T15:51:53Z · body
- 2026-09-27T15:52:44Z · body
- 2026-09-28T01:11:51Z · status ready→active, branch
- 2026-09-28T01:18:16Z · status active→review
- 2026-09-28T01:21:29Z · status review→active
- 2026-09-28T01:29:06Z · handoff failed · remote validation failed: remote validation failed (exit 1) —  ❯ tests/config-docs.test.ts:64:30
     62|     const match = environmentDoc.match(/## `\.env\.example`\n[\s\S]*?`…
     63|     expect(match, "embedded .env.example block not found").not.toBeNul…
     64|     expect(match![1].trim()).toBe(envExample.trim());
       |                              ^
     65|   });
     66|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 291 passed (292)
      Tests  1 failed | 3394 passed | 12 skipped (3407)
   Start at  01:26:51
   Duration  132.01s (transform 3.96s, setup 1.25s, import 17.66s, tests 103.75s, environment 127.65s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 268ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  01:29:03
   Duration  1.51s (transform 655ms, setup 9ms, import 759ms, tests 268ms, environment 409ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-09-28T01:34:25Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/config-docs.test.ts:64:30 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-09-28T01:34:30Z · status review→active
- 2026-09-28T01:38:40Z · handoff failed · task-file handoff failed at check · repoos check failed: [90mstderr[2m | tests/auto-preview.test.ts[2m > [22m[2mon-demand previews (#0271 follow-up)[2m > [22m[2mcaps concurrent previews at 1 and evicts the previous one when a new one starts · [22m[39m[preview] 2026-09-28T01:38:29.568Z #0001 evicted — terminated to keep concurrent previews at 1 (oldest running; started 2026-09-28T01:38:29.076Z) · [preview] 2026-09-28T01:38:29.568Z #0001 stopped — target=default url=http://127.0.0.1:51102 pid=2527 · [90mstderr[2m | tests/auto-preview.test.ts[2m > [22m[2mon-demand previews (#0271 follow-up)[2m > [22m[2mcaps concurrent previews at 1 and evicts the previous one when a new one starts · [22m[39m[preview] 2026-09-28T01:38:33.740Z #0002 started — target=default url=http://127.0.0.1:51118 pid=4117 port=51118 · [31m❯[39m tests/auto-preview.test.ts [2m([22m[2m2 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[33m 35061[2mms[22m[39m · [31m     [31m×[31m does not auto-launch on transition to review, launches on request, and closes when leaving review[39m[33m 18510[2mms[22m[39m · [33m[2m✓[22m[39m caps concurrent previews at 1 and evicts the previous one when a new one starts [33m 16550[2mms[22m[39m
- 2026-09-28T01:44:24Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/config-docs.test.ts:64:30 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-09-28T01:44:24Z · status review→active
- 2026-09-28T01:45:38Z · status active→review
- 2026-09-28T01:48:49Z · status review→active
- 2026-09-28T02:18:37Z · status active→review
- 2026-09-28T02:21:32Z · needs_input
- 2026-09-28T03:20:20Z · review_cli_override, review_model_override
- 2026-09-28T03:20:22Z · review_cli_override
- 2026-09-28T03:20:24Z · review_model_override
