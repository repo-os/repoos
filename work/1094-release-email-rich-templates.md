---
last_close_out_gate_ms: 743795
last_close_out_gate_at: "2026-11-13T14:40:34.596Z"
id: "1094"
title: "Release email: rich templates"
type: feature
status: review
priority: p3
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/release-email-rich-templates
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-11T05:28:26Z"
updated_at: "2026-11-13T14:40:34Z"
review_passes: 1
---
## Problem
The first release-email cut (#1071) renders one plain HTML and text pair. The spec asked for grouped release notes, per-recipient unsubscribe and links that work for non-GitHub hosts. None of these fit the first cut, so they are filed here.

## Acceptance criteria
1. Release notes group into sections (features, fixes, other) in the HTML body.
2. Each recipient gets an unsubscribe link that turns off that address's release emails.
3. Links work for a non-GitHub repository host.
4. Each item has its own tests with fake values.

## Notes for AI
See src/server/release-email.ts (renderReleaseEmail). Keep zero runtime dependencies and send nothing from tests.

## Activity

- 2026-11-11T05:28:26Z · created · njachowski@gmail.com
- 2026-11-11T05:28:27Z · needs_input
- 2026-11-11T05:28:40Z · body: Problem (added); Acceptance criteria (added); Notes for AI (added)
- 2026-11-13T11:55:47Z · cli_override, model_override
- 2026-11-13T11:56:01Z · status inbox→ready
- 2026-11-13T11:56:06Z · status ready→active, needs_input, branch
- 2026-11-13T12:13:27Z · body
- 2026-11-13T12:20:35Z · body
- 2026-11-13T12:22:40Z · CTO nudge: held — handoff gate is running
- 2026-11-13T12:22:41Z · status active→review
- 2026-11-13T12:22:41Z · note: Task body is underspecified: missing sections: Desired UX
- 2026-11-13T12:22:41Z · message_queued at 2026-11-13T12:22:41.493Z
- 2026-11-13T12:22:41Z · note: shots: skipped — the diff (7 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-13T12:23:24Z · note: review pass 1: good to go
- 2026-11-13T14:30:06Z · message_overdue: still queued after 60m without being delivered
- 2026-11-13T14:40:34Z · close-out gate completed in 744s

