---
id: "0708"
title: "Docs follow-up for #0683: running-with-agents.md section 3 must describe startup host probing and local-fallback visibility"
type: chore
status: review
priority: p3
area: docs
assigned_to: ai
created_by: ""
branch: feat/docs-follow-up-for-0683-running-with-age
created_at: "2026-10-06T05:24:59Z"
updated_at: "2026-10-08T17:06:15Z"
---
## Problem

#0683 (remote validation: probe hosts at startup, say when a job fell back to local) landed without its Docs follow-up: user-docs/running-with-agents.md section 3 still describes silent fallback and does not mention the boot-time and 60 s host probe, the bell notice when a job fell back to local, or the fallback detail in Checks > Runs.

## Desired UX

Section 3 of the playbook says: hosts are probed at server start and every 60 s while unhealthy; a close-out that fell back to local is flagged in the bell and in the run's detail; how to read Checks > Remote runners.

## Acceptance criteria

- The playbook page is updated and consistent with docs/remote-validation.md. repoos check passes.

## Notes for AI

Small docs-only task. Read #0683 and docs/remote-validation.md first.

## Activity

- 2026-10-06T05:24:59Z · created · unknown
- 2026-10-08T16:41:49Z · status inbox→ready
- 2026-10-08T16:41:50Z · status ready→active, branch
- 2026-10-08T16:58:58Z · body
- 2026-10-08T16:59:56Z · body
- 2026-10-08T17:06:15Z · status active→review
- 2026-10-08T17:06:15Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
