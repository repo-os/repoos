---
id: "0913"
title: "Implement ADR 0009: run whole engineer sessions on remote runners"
type: feature
status: inbox
priority: p1
area: [server, core]
depends_on: ["0912"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-22T01:41:44Z"
updated_at: "2026-10-22T01:41:56Z"
---
## Problem
ADR 0009 (docs/adr/0009-remote-engineer-sessions.md, landed with #0904) decides the design for running engineer sessions on remote runners with bundle-in / bundle-out sync, but nothing is implemented. The laptop is still the throughput limit.

## Desired UX
A task can run its engineer on a healthy runner chosen by the existing pool and #0901 health probe, with the transcript streaming to the laptop, Send/Pause/Resume working, the branch tip bundled back to the local worktree before handoff, and local runs unchanged as the default and the fallback.

## Acceptance criteria
- Implement the ADR's execution model: runner worktree from the per-repo mirror, bundle in at start, bundle out after each turn and before handoff, fast-forward only into a clean local worktree, explicit divergence recovery.
- Spawn/stream/stop/message/resume through the existing AgentRunner interface, heartbeat, and a lost connection distinguished from a crashed agent; reload re-attach (#0288) and phantom healing (#0863) apply.
- Runner capability advertisement (which engineer CLIs are installed and signed in) and capability-aware placement, with per-host concurrent-engineer limit and Settings controls.
- Proven with fake runners and fake CLIs in tests only: runner unreachable at start, mid-run disconnect, runner reboot, dirty remote worktree, divergence.
- Docs follow ADR 0009 and user-docs/remote-engineers.md; AGENTS.md updated where the ADR changed the worktree rule.
- Out of scope: logging CLIs in on real runners and a real end-to-end run (human task #0907).

## Notes for AI
Do not start before #0912 (ADR acceptance). Read the ADR first and implement it in slices; split into follow-up tasks if it grows past one reviewable change.

## Activity

- 2026-10-22T01:41:44Z · created · njachowski@gmail.com
