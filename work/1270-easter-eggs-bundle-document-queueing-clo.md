---
id: "1270"
title: "Easter eggs bundle: document queueing close-outs (MTD) together"
type: feature
status: done
priority: p2
area: docs
merged_commit: 3976d84dbe0589caca5f7d22fa16f95b012e6791
assigned_to: ai
created_by: t@t
branch: feat/easter-eggs-bundle-document-queueing-clo
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T05:43:15Z"
updated_at: "2026-11-20T09:14:22Z"
last_close_out_gate_ms: 163957
last_close_out_gate_at: "2026-11-20T09:14:17.247Z"
review_passes: 1
---
## Problem
Drivers (and agents) land green review tasks one at a time, waiting for each to finish before clicking Move to done on the next. The close-out pipeline already has a queued phase and publishes under a lock, so queueing every green task at once keeps the pipeline busy and lands more work sooner. This is not written down as guidance, so it keeps getting done the slow way.

## Desired UX
A driver or agent reading the docs knows: queue every green task (landable says ready to merge) for close-out right away; the queue runs them in order; do not wait for one to finish before queueing the next; what to do when one fails (fix and re-queue, others continue); and that machine load, not click timing, is what limits speed.

## Acceptance criteria
- docs/close-out-pipeline.md gets a short Queueing several close-outs section (queued phase, queuePosition via GET /api/tasks/<id>/integration-job, running repoos done for each task without waiting, failure handling).
- docs/driver-notes.md gets a matching best-practice line, and the driver brief mentions it if it lists landing steps.
- AGENTS.md gets at most one line pointing to that section (keep the file under its size limit).
- Any contradicting line saying close-outs should be run one at a time is fixed.

## Notes for AI
Docs-only. Never touch repoos.toml. Observed 2026-11-20: six close-outs queued together showed queuePosition 0..5 and ran in order.

## Activity

- 2026-11-20T05:43:15Z · created · t@t
- 2026-11-20T05:43:23Z · status inbox→ready
- 2026-11-20T05:43:29Z · cli_override, model_override
- 2026-11-20T05:43:31Z · status ready→active, branch
- 2026-11-20T05:46:28Z · CTO nudge: held — handoff gate is running
- 2026-11-20T05:48:08Z · status active→review
- 2026-11-20T05:48:09Z · message_queued at 2026-11-20T05:48:09.477Z
- 2026-11-20T05:48:10Z · note: shots: skipped — the diff (5 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-20T05:49:03Z · note: review pass 1: good to go
- 2026-11-20T07:07:02Z · message_overdue: still queued after 60m without being delivered
- 2026-11-20T09:14:17Z · close-out gate completed in 164s
- 2026-11-20T09:14:22Z · status done→done, release:success
