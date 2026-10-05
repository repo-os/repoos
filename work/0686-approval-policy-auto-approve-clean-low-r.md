---
id: "0686"
title: "Approval policy: auto-approve clean, low-risk reviews with an audit trail; keep UI and risky tasks human"
type: feature
status: inbox
priority: p2
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-10-05T16:58:55Z"
updated_at: "2026-10-05T16:58:55Z"
---
## Problem

Approving (Move to done) is a human step by design, and the CTO only reports. Driving a 30-task project, almost every non-UI approval was a rubber stamp: gate green, review "good to go", no blocking findings. A driver script auto-approved those safely for ~15 API/data/platform tasks (no defects surfaced from them), while all four defects that reached review in UI tasks were caught only by a human looking at the running app. Policy, not a script, should decide.

## Desired UX

A `[approval]` section in `repoos.toml` (with a Settings UI control, per the repo rule) with rules such as:
- `autoApprove.areas = ["api", "data", "docs", "chore"]` and/or types;
- conditions: gate green, reviewer verdict clean (no blocking bugs), no `needsInput`, branch not drifted, task not labelled `human-only`;
- UI areas are never auto-approved unless the handoff included clean screenshots + console (see the UI verification task);
- every auto-approval is recorded in the task activity and the bell ("auto-approved by policy: <rule>") so it is auditable and reversible; a global kill switch.

## Acceptance criteria

- Tests for each condition and for the audit entries; Settings UI control and docs. Default is OFF. `repoos check` passes.

See also: UI verification gate task; attention queue task.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Activity

- 2026-10-05T16:58:55Z · created · unknown
