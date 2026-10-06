---
id: "0723"
title: "CLI/API parity: every API action should be doable from the repoos CLI (start, pause, review, done, message, preview, config, runners, stats)"
type: feature
status: active
priority: p2
area: [cli, server]
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/cli-api-parity-every-api-action-should-b
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T14:59:25Z"
updated_at: "2026-10-06T18:41:19Z"
last_check_failure: "repoos check at 2026-10-06T18:40:11.714Z: server-side finalization timed out (deadline exceeded)"
review_rounds: 1
review_passes: 1
handoff_signal_retry_count: 1
dev_error_count: 1
---
## Problem

Driving the board overnight on 2026-10-06 needed a hand-rolled curl session (dev-login cookie jar, re-login after every server reload) for everything that matters, because the CLI only covers file-level task edits (list, show, new, update, note, mv, rm). Things the API can do that the CLI cannot: start a task (POST /api/tasks/:id/start, incl. mode=fresh), pause, send an agent a message (POST /message), request review synchronously (PATCH status=review; `repoos mv review` is an async file write the server intercepts and it flaked all night), Move to done (POST /done incl. commitDirty; `repoos mv done` is a status flip that never merges, a documented footgun), per-task agent overrides (PATCH cliOverride/modelOverride; failed silently), preview start/stop, config get/set (PATCH /api/config), remote-runner status and probe (/api/remote-validation/status, /test), running agents (/api/agents/running), board stats/spend (/api/stats/board). Agents and humans on the CLI had to guess curl invocations. Rule going forward: anything the API can do, the CLI can do (the reverse is not required).

## Desired UX

- A short command family that wraps the server API: `repoos start <id> [--fresh]`, `pause <id>`, `message <id> "text"`, `review <id>` (synchronous; waits for and prints the handoff result or the failure reason), `done <id> [--commit-dirty]` (the real close-out pipeline, prints stage progress, refuses like the UI does), `override <id> --cli X --model Y` (verifies and prints the effective agent+model), `preview <id> [--stop]`, `config get|set <key> [value]`, `runners [--probe]`, `agents` (running), `stats`.
- Auth handled once: the CLI reuses a stored session or the dev-login flow for local servers (never prints the code), re-logs in transparently on 401 after a server reload, and fails with a clear message when the server is down. No cookie-jar juggling.
- Every command supports --json. Output of long operations is streamed or pollable, with a --wait flag.
- `repoos mv <id> done` and `mv <id> review` point to the real commands in their help and in the error text.
- A parity guard in the test suite: enumerate registered API routes and fail when a route has neither a CLI command nor an entry in an explicit allowlist of UI-only/internal routes (so parity cannot rot).

## Acceptance criteria

- Tests for each new command against the test server (including 401 re-login and server-down). The route-parity test exists with a reviewed allowlist.
- Docs updated: user-docs CLI reference, AGENTS.md (interactive sessions use the CLI, not curl), docs/. repoos check passes.

## Notes for AI

Read src/commands/tasks.ts and src/cli/ for the command registry and the HTTP route table in src/server/server.ts (router.register calls) for the full API surface. Zero runtime dependencies: use fetch. Related: #0699 (CLI help drift), #0696 (stories CLI). Do not print or log secrets or the dev-login code.

## Activity

- 2026-10-06T14:59:25Z · created · unknown
- 2026-10-06T15:05:35Z · cli_override, model_override
- 2026-10-06T15:05:48Z · status inbox→ready
- 2026-10-06T15:05:55Z · status ready→active, branch
- 2026-10-06T15:12:01Z · agent exited with an error (cursor) · RetriableError: Connection stalled repeatedly
- 2026-10-06T15:55:45Z · needs_input
- 2026-10-06T17:21:18Z · body
- 2026-10-06T17:26:33Z · handoff failed · remote validation failed: remote validation failed (exit 1) —        |                                        ^
    415|         "the task is put back in review",
    416|       );
 ❯ waitFor tests/helpers.ts:45:11
 ❯ tests/agent-review.test.ts:413:13
 ❯ withServer tests/agent-review.test.ts:279:11
 ❯ tests/agent-review.test.ts:403:11
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 424 passed | 1 skipped (426)
      Tests  1 failed | 5087 passed | 15 skipped (5103)
   Start at  17:22:55
   Duration  213.48s (transform 5.57s, setup 1.85s, import 29.38s, tests 189.25s, environment 186.98s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 348ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  17:26:29
   Duration  1.96s (transform 976ms, setup 10ms, import 1.12s, tests 348ms, environment 414ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-06T17:32:25Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —        |                                        ^ · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-06T17:32:26Z · status review→active
- 2026-10-06T17:42:25Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-10-06T17:43:28Z · status active→review
- 2026-10-06T17:43:28Z · status review→active
- 2026-10-06T17:43:58Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 127) — + pinia@4.0.2
+ radix-vue@1.9.17
+ shiki@4.4.3
+ tailwind-merge@3.6.0
+ tailwindcss@4.3.3
+ typescript@5.9.3
+ vite@8.2.0
+ vitest@4.1.10
+ vue@3.5.40
+ vue-router@5.2.0
+ vue-tsc@3.3.9
422 packages installed [1031.00ms]
$ bun scripts/build.mjs
$ tsc -p tsconfig.json && bun run build:ui && bun scripts/copy-assets.mjs
$ vue-tsc --noEmit -p src/ui-app/tsconfig.json && vite build --config src/ui-app/vite.config.ts
/usr/bin/bash: line 1: vite: command not found
error: script "build:ui" exited with code 127
error: script "build:raw" exited with code 127
error: script "build" exited with code 127
[validate] gate exit 127 — fix it in the feature branch and re-run the gate
- 2026-10-06T17:49:28Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —        |                                        ^ · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-06T17:49:28Z · status review→active
- 2026-10-06T17:54:04Z · handoff failed · task-file handoff failed at check · repoos check failed: build complete in 4.19s. · ⏭ landing-build  — skipped — no changed path matches landing/** · ⏭ telegram-manager-build  — skipped — no changed path matches telegram-manager/** · ⏭ telegram-manager-test  — skipped — no changed path matches telegram-manager/** · ⏭ macos-hub-icon-transparency  — skipped — no changed path matches macos/RepoOSHub/Assets.xcassets/**, macos/scripts/generate-app-icons.swift, macos/scripts/verify-dock-icon-transparency.swift, macos/scripts/verify-dock-icon-transparency.sh · 1 check(s) failed. · ── Failed steps ── · ✗ rendered-contrast — rerun: repoos check --profile full --step rendered-contrast --changed f8aed19bc
- 2026-10-06T17:59:28Z · watchdog: restarted engineer after identical check failure · branch tip unchanged since the last failing handoff validation
- 2026-10-06T18:01:24Z · body
- 2026-10-06T18:02:13Z · body
- 2026-10-06T18:03:13Z · body
- 2026-10-06T18:04:02Z · body
- 2026-10-06T18:07:19Z · body
- 2026-10-06T18:17:28Z · status active→review
- 2026-10-06T18:17:30Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-06T18:18:20Z · note: review pass 1: needs some work
- 2026-10-06T18:18:20Z · status review→active
- 2026-10-06T18:27:48Z · body
- 2026-10-06T18:29:20Z · body
- 2026-10-06T18:40:44Z · status active→review
- 2026-10-06T18:40:44Z · status review→active
- 2026-10-06T18:40:54Z · body
- 2026-10-06T18:41:19Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
