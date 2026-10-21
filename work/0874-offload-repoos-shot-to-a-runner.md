---
id: "0874"
title: Offload repoos shot to a runner
type: feature
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "engineer keeps crashing (3 in 30m): a human-set task override (opencode + opencode-go/deepseek-v4.1-flash) is pinned, so RepoOS did not replace it. Review the crash detail and either fix the environment, change the override, or resume manually."
debug_tldr: "Handoff deferred because queued CTO check-in was unread—read it, finish verification, then request review again."
debug_tldr_at: "2026-10-21T11:41:18Z"
debug_tldr_key: "dev-error|✗ handoff deferred — read the queued message(s) first, then request review again"
priority: p3
area: [server, core]
depends_on: ["0854"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/offload-repoos-shot-to-a-runner
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T12:27:49Z"
updated_at: "2026-10-21T11:51:30Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-10-21T09:07:49.677Z: repoos check failed: ◆ Check plan"
dev_error_count: 4
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-21T11:40:29.532Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-21T11:41:47.380Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-21T11:42:38.515Z\",\"kind\":\"dev-error\"}]"
---
## Problem
Parent #0854 offloads the AUTOMATIC handoff shots and UI verification to a remote runner. Manual `repoos shot` / `repoos verify` deliberately STAY LOCAL: the spec was narrowed in #0854 review pass 17, so #0854 does not ship a runner-backed CLI. The interactive CLI keeps using the local PreviewManager / WebKit on the control-plane laptop.

## Desired UX
`repoos shot` / `repoos verify` run their capture on an available runner in the same way the automatic handoff capture does, while still falling back locally when a runner is unavailable.

## Acceptance criteria
- `repoos shot` / `repoos verify` can offload capture to a runner, reusing the canonical capture context (#0854, `src/core/remote-capture.ts`) and the browser-capture policy/fallback rules.
- `runner-available` falls back locally with a visible note; `runner-only` returns a structured error (never throws).
- Tests: runner-backed CLI capture succeeds, falls back locally, and returns the structured error in runner-only.

## Notes for AI
Not required for #0854's acceptance criteria. #0864 (rebuild the runner image and record a real end-to-end proof) is separate and out of scope here. Source: #0854 review pass 17.

## Activity

- 2026-10-20T12:27:49Z · created · njachowski@gmail.com
- 2026-10-20T12:27:52Z · needs_input
- 2026-10-20T12:28:31Z · body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
- 2026-10-20T13:22:47Z · needs_input
- 2026-10-21T08:22:46Z · status inbox→ready
- 2026-10-21T08:22:50Z · cli_override, model_override
- 2026-10-21T08:22:51Z · status ready→active, branch
- 2026-10-21T08:24:31Z · agent exited with an error (opencode) · error: Upstream request failed: Endpoint is unavailable.
- 2026-10-21T08:24:31Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · error: Upstream request failed: Endpoint is unavailable.
- 2026-10-21T08:35:02Z · body
- 2026-10-21T08:39:02Z · body
- 2026-10-21T08:44:28Z · body
- 2026-10-21T08:50:59Z · body
- 2026-10-21T08:54:44Z · body
- 2026-10-21T08:56:00Z · needs_input
- 2026-10-21T09:03:13Z · status active→ready
- 2026-10-21T09:03:17Z · status ready→active
- 2026-10-21T10:24:21Z · body
- 2026-10-21T10:37:25Z · CTO nudge: held — machine under pressure (the memory compressor is holding 40% of RAM (9.7 GB of RAM) — holding new work until memory pressure eases)
- 2026-10-21T10:53:32Z · message_queued at 2026-10-21T10:53:32.258Z
- 2026-10-21T10:53:32Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T11:13:12Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T11:37:23Z · body
- 2026-10-21T11:40:02Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-21T11:40:03Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-21T11:40:05Z · message_delivered: 1 message(s)
- 2026-10-21T11:40:29Z · agent exited with an error (opencode) · ✗ handoff deferred — read the queued message(s) first, then request review again
- 2026-10-21T11:40:29Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · ✗ handoff deferred — read the queued message(s) first, then request review again
- 2026-10-21T11:41:47Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (2/3 crashes in 30m) · ✗ handoff deferred — read the queued message(s) first, then request review again
- 2026-10-21T11:42:23Z · body
- 2026-10-21T11:42:38Z · engineer crash recovery: surfaced instead of switching — a human-set task override (opencode + opencode-go/deepseek-v4.1-flash) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-21T11:43:40Z · body
- 2026-10-21T11:51:25Z · status active→ready
- 2026-10-21T11:51:30Z · status ready→active
