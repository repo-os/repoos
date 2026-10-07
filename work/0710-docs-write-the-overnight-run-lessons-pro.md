---
id: "0710"
title: "Docs: write the overnight-run lessons (provider-failure scraper, self-check starvation, driver tips) into the repo"
type: chore
status: review
priority: p2
area: docs
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/docs-write-the-overnight-run-lessons-pro
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T08:37:40Z"
updated_at: "2026-10-07T02:43:48Z"
review_passes: 1
last_check_failure: "repoos check at 2026-10-07T01:37:59.207Z: server-side finalization timed out (deadline exceeded)"
dev_error_count: 1
---
## Problem

Durable lessons from the 2026-10-06 overnight triage run live only in /Users/nick/code/jago/opex/repoos/docs/ (the log and a session handoff) and in chat, not in this repo, which breaks the "the repo is the system of record" rule in AGENTS.md.

## Desired UX

Add a short section to docs/debugging-check-failures.md and docs/close-out-pipeline.md (or one new docs/agent-run-operations.md linked from docs/README.md) covering: (1) the provider-failure scraper false positive (#0709): what scrapeProviderFailure may inspect and why whole stream-json lines must never be substring-matched; how to recognise it (task needs_input provider-failure whose detail is a random JSON line, agents die with empty stderr); (2) standalone self-check slot starvation and the host-lock / dispatcher rules (#0694, #0705, #0706); (3) driver tips: spawn a turn with POST /api/tasks/<id>/message when /start leaves nothing running, verify PATCH responses, active<->review flips are the interceptor, re-handoff after a conflict merge needs mv active then mv review, never commitDirty unless only bookkeeping is dirty; (4) when to use cheap Cursor models.

## Acceptance criteria

- Docs updated and linked from docs/README.md; no code change. repoos check passes.

## Notes for AI

Source material: /Users/nick/code/jago/opex/repoos/docs/overnight-log-2026-10-06.md and session-handoff-2026-10-06-pm.md. Docs-only, small.

## Activity

- 2026-10-06T08:37:40Z · created · unknown
- 2026-10-06T08:37:43Z · story
- 2026-10-07T01:15:43Z · cli_override, model_override
- 2026-10-07T01:15:49Z · note: DRIVER scope/current-version requirement: use the latest session-handoff-2026-10-07-am.md UPDATE00:40Z plus overnight-log current entries; older pm handoff is superseded. Independently check every proposed rule against current main and AGENTS.md. #0723 now provides authenticated CLI control-plane commands; document those rather than obsolete curl/session advice. Do not repeat unproven claims that task bookkeeping restarts validation, that stale host scripts alone caused the mirror bug, or that silence proves model/network failure. Preserve incident context separately from current operating rules. No code/config/main commit/server/host changes. Docs-only; do not modify unrelated docs or AGENTS rules outside the task scope.
- 2026-10-07T01:16:17Z · status inbox→ready
- 2026-10-07T01:16:22Z · status ready→active, branch
- 2026-10-07T01:22:47Z · body
- 2026-10-07T01:37:56Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-10-07T01:38:01Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-10-07T01:38:22Z · status active→review
- 2026-10-07T01:38:22Z · status review→active
- 2026-10-07T01:58:46Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-10-07T02:06:17Z · status active→review
- 2026-10-07T02:06:17Z · status review→active
- 2026-10-07T02:08:34Z · needs_input
- 2026-10-07T02:14:26Z · status active→review
- 2026-10-07T02:14:26Z · note: shots: skipped — the diff (5 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-07T02:30:48Z · note: review pass 1: failed — no usable report
- 2026-10-07T02:30:48Z · needs_input
- 2026-10-07T02:38:25Z · needs_input (review-failed) cleared for review again by human
- 2026-10-07T02:39:08Z · note: review pass 2: good to go
- 2026-10-07T02:40:46Z · status review→active
- 2026-10-07T02:42:52Z · body
- 2026-10-07T02:43:07Z · status active→review
- 2026-10-07T02:43:07Z · note: shots: skipped — the diff (5 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-07T02:43:48Z · note: review pass 3: good to go
