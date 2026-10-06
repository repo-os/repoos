---
id: "0705"
title: Remote runners tab and dispatcher must see standalone self-check slot holders (they starved close-outs); add refresh feedback
type: bug
status: active
needs_input: true
needs_input_reason: provider-failure
needs_input_detail: "{\"type\":\"tool_call\",\"subtype\":\"completed\",\"call_id\":\"toolu_bdrk_013Dkabx3PDrnQ8hZqVTTSbv\",\"tool_call\":{\"editToolCall\":{\"args\":{\"path\":\"/Users/nick/code/nick/repoos-worktrees/feat/remote-runners-tab-and-dispatcher-must-s/src/server/remote-validation.ts\",\"streamContent\":\"  async acquire(\n    capabilities: string[],\n    opts: {\n      /** Fired once this run joins the FIFO queue (#0706: host + position too). */\n      onQueue?: (info: { ahead: number; host: string }) => void;\n      deadlineAt?: "
priority: p1
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/remote-runners-tab-and-dispatcher-must-s
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T03:31:15Z"
updated_at: "2026-10-06T07:37:40Z"
review_rounds: 2
review_passes: 2
dev_error_count: 7
---
## Problem

Overnight 2026-10-06 the Checks > Remote runners tab showed every host "idle", "queue empty", "0/2 in flight" while real work was running and waiting: four engineer self-checks had live ssh sessions to the same host (all to nick@bee at one point, aged 4-23 minutes), and a close-out for task 0693 failed THREE times in a row with "remote validation unavailable: another repoos check is already running on bee — waited 590s for a free host slot (the per-host limit is shared by the server and standalone checks)" (check_runs, 02:44Z, 03:04Z, 03:17Z). The server dispatcher counts only the runs IT dispatched ("fewest active runs"), so standalone `repoos check` runs (engineer self-checks, now remote since #0694) are invisible to it: it kept choosing the host the self-checks had already filled, then waited its whole 10-minute close-out budget on the host-side lock and timed out. The tab also hid the real queue: waiting standalone checks are not shown anywhere, so an operator cannot tell "idle" from "blocked behind four invisible jobs". Separately, the Refresh button gives no feedback: clicking it appears to do nothing, so there is no way to tell success from failure.

## Desired UX

- The Remote runners tab shows EVERYTHING holding or waiting for a host slot, not only server-dispatched jobs: for each host the lock holders and waiters with task id (or "standalone check in <worktree>"), phase (self-check / pre-review / close-out / release), age, and queue position. "idle" means truly idle.
- The dispatcher counts host-side lock holders and waiters (read them from the host lock files or have standalone checks register with the server) when choosing the host with the fewest active runs, so a close-out never queues behind a pile of self-checks on one host while another host is free.
- Close-out and release gates take priority over engineer self-checks for a slot (a close-out must never starve behind self-checks).
- A failed "waited N s for a free host slot" says which job(s) held the slot, and retries on another idle host before spending the budget waiting.
- The Refresh button shows an in-progress state (spinner/disabled), then a visible success (updated "just now" with a short toast or check mark) or failure (error toast with the reason). Use the shared dialog/toast components and styled tooltips per AGENTS.md; keyboard accessible.

## Acceptance criteria

- Tests: dispatcher avoids a host whose slots are held by standalone checks; close-out is not starved by waiting self-checks; the runners view lists standalone holders and waiters; refresh shows loading then success and failure states.
- Docs updated (docs/remote-validation.md, user-docs/check.md). repoos check passes.

## Notes for AI

Read #0694 and #0695 first (engineer self-checks on runners; item 6 there covers the self-check path pinning the first host: coordinate, do not duplicate), #0683 (probe/fallback visibility) and docs/remote-validation.md (host lock, maxConcurrent per host). Evidence: sqlite3 .repoos/checks.db "select ... from check_runs where task_id=0693" and the owner screenshot of the Remote runners tab at 11:29 local showing all hosts idle.

## Scope addition: fold in #0706
Task #0706 (filed by the #0695 reviewer: standalone self-check prefers the least-loaded remote host, plus stuck-badge / transcript copy for queued remote runs) is the same problem from the self-check side. Implement it HERE so there is one coherent fix: (a) standalone self-checks choose the idlest eligible host using the same counts the dispatcher uses (include host-side lock holders and waiters); (b) the stuck badge and the engineer transcript say 'waiting for a runner (host, position)' instead of reporting a silent/stuck agent; (c) close-out/release priority over self-checks. When done, note on #0706 that it is superseded. Owner priority: p1, goal is getting the remote runners to their full potential (idle hosts used, no starvation, visible queue).

## Shots
```json
[
  {
    "label": "Remote runners tab with refresh feedback",
    "target": "default",
    "route": "/checks?tab=remote-runners",
    "highlight": ".rr-panel"
  }
]
```

## Activity

- 2026-10-06T03:31:15Z · created · unknown
- 2026-10-06T03:31:24Z · story
- 2026-10-06T04:07:30Z · status inbox→ready
- 2026-10-06T04:07:31Z · cli_override, model_override
- 2026-10-06T04:07:31Z · status ready→active, branch
- 2026-10-06T04:07:54Z · body: section Scope addition: fold in #0706
- 2026-10-06T04:26:19Z · body: section Shots
- 2026-10-06T06:19:56Z · handoff failed · remote validation failed: remote validation failed (exit 1) —     651|       // true per-pass counter used by the D# · R# badge.
    652|       expect(readFileSync(task.absPath, "utf8")).toMatch(/^review_pass…
       |                                                  ^
    653|     });
    654|   }, 90_000);
 ❯ withServer tests/agent-review.test.ts:279:11
 ❯ tests/agent-review.test.ts:625:11
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 414 passed | 1 skipped (416)
      Tests  1 failed | 5022 passed | 15 skipped (5038)
   Start at  06:15:46
   Duration  241.30s (transform 6.24s, setup 2.00s, import 41.19s, tests 225.99s, environment 191.72s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 728ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  06:19:48
   Duration  2.62s (transform 1.08s, setup 13ms, import 1.36s, tests 728ms, environment 444ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-06T06:24:40Z · status active→review
- 2026-10-06T06:24:40Z · status review→active
- 2026-10-06T06:30:04Z · status active→review
- 2026-10-06T06:30:05Z · note: shots: skipped — 1 handoff shot already captured during finalization (#0680)
- 2026-10-06T06:31:06Z · note: review pass 1: needs some work
- 2026-10-06T06:31:06Z · status review→active
- 2026-10-06T06:31:54Z · agent exited with an error (cursor) · {"type":"tool_call","subtype":"started","call_id":"tool_dfe8d9dc-0030-4022-a076-d41f7daf065","tool_call":{"readToolCall":{"args":{"path":"/Users/nick/code/nick/repoos-worktrees/feat/remote-runners-tab-and-dispatcher-must-s/src/server/remote-validation.ts","offset":2945,"limit":90}},"hookAdditionalContexts":[],"toolCallId":"tool_dfe8d9dc-0030-4022-a076-d41f7daf065","startedAtMs":"1791268313908"},"model_call_id":"ba00a2de-fd6d-4f79-8778-84b978483b17-7-nfcx","session_id":"4de1a743-5ba4-41d0-961c-6f
- 2026-10-06T06:32:18Z · status active→review
- 2026-10-06T06:32:19Z · status review→active
- 2026-10-06T06:42:39Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-10-06T06:50:29Z · status active→review
- 2026-10-06T06:50:29Z · status review→active
- 2026-10-06T06:51:33Z · status active→review
- 2026-10-06T06:51:33Z · status review→active
- 2026-10-06T07:04:18Z · needs_input
- 2026-10-06T07:04:45Z · agent exited with an error (cursor) · {"type":"thinking","subtype":"delta","text":" extending `queueNote`","session_id":"4de1a743-5ba4-41d0-961c-6f00a70b14eb","timestamp_ms":1791270285402}
- 2026-10-06T07:13:32Z · needs_input
- 2026-10-06T07:14:40Z · agent exited with an error (cursor) · {"type":"tool_call","subtype":"completed","call_id":"tool_bfa5ccb9-534d-45cd-a61d-471da9117eb","tool_call":{"editToolCall":{"args":{"path":"/Users/nick/code/nick/repoos-worktrees/feat/remote-runners-tab-and-dispatcher-must-s/src/server/remote-validation.ts","streamContent":"/** Parse {@link hostLockInspectShell} output into a snapshot (#0705). */"},"result":{"success":{"path":"/Users/nick/code/nick/repoos-worktrees/feat/remote-runners-tab-and-dispatcher-must-s/src/server/remote-validation.ts","l
- 2026-10-06T07:18:15Z · model_override
- 2026-10-06T07:18:58Z · needs_input
- 2026-10-06T07:20:08Z · agent exited with an error (cursor) · {"type":"thinking","subtype":"delta","text":"irming close-out be","session_id":"4de1a743-5ba4-41d0-961c-6f00a70b14eb","timestamp_ms":1791271208402}
- 2026-10-06T07:20:08Z · status active→review
- 2026-10-06T07:20:08Z · status review→active
- 2026-10-06T07:25:49Z · status active→review
- 2026-10-06T07:25:50Z · note: shots: skipped — 1 handoff shot already captured during finalization (#0680)
- 2026-10-06T07:27:32Z · note: review pass 2: needs some work
- 2026-10-06T07:27:32Z · status review→active
- 2026-10-06T07:32:22Z · status active→review
- 2026-10-06T07:32:22Z · status review→active
- 2026-10-06T07:33:04Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 2) — + radix-vue@1.9.17
+ shiki@4.4.3
+ tailwind-merge@3.6.0
+ tailwindcss@4.3.3
+ typescript@5.9.3
+ vite@8.2.0
+ vitest@4.1.10
+ vue@3.5.40
+ vue-router@5.2.0
+ vue-tsc@3.3.9
422 packages installed [999.00ms]
$ git config core.hooksPath .githooks 2>/dev/null || true
$ bun scripts/build.mjs
$ tsc -p tsconfig.json && bun run build:ui && bun scripts/copy-assets.mjs
src/server/remote-validation.ts(2251,9): error TS2322: Type '((info: { ahead: number; host: string; }) => void) | undefined' is not assignable to type '((ahead: number) => void) | undefined'.
  Type '(info: { ahead: number; host: string; }) => void' is not assignable to type '(ahead: number) => void'.
    Types of parameters 'info' and 'ahead' are incompatible.
      Type 'number' is not assignable to type '{ ahead: number; host: string; }'.
src/server/remote-validation.ts(3020,41): error TS2345: Argument of type '{ ahead: number; host: string; }' is not assignable to parameter of type 'number'.
[validate] gate exit 2 — fix it in the feature branch and re-run the gate
- 2026-10-06T07:36:39Z · model_override
- 2026-10-06T07:37:40Z · status active→review
- 2026-10-06T07:37:40Z · status review→active
