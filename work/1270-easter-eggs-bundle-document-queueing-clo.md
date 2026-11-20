---
id: "1270"
title: "Easter eggs bundle: document queueing close-outs (MTD) together"
type: feature
status: ready
priority: p2
area: docs
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-20T05:43:15Z"
updated_at: "2026-11-20T05:43:23Z"
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
