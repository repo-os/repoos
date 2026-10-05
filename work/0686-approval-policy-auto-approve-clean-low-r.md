---
id: "0686"
title: "Approval policy: auto-approve clean, low-risk reviews with an audit trail; keep UI and risky tasks human"
type: feature
status: ready
priority: p2
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: ""
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-05T16:58:55Z"
updated_at: "2026-10-05T21:20:31Z"
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

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read that file first: it holds the background of the run that produced this task, the facts already established for your theme (with the evidence), the decisions the owner has already made, the known uncertainties, and the list of sibling tasks you should coordinate with. Verify its facts against the current source before relying on them, and say in the task notes if you find anything in it that is wrong or out of date.

## Docs follow-up
The playbook page `user-docs/running-with-agents.md` (landed on main) describes the CURRENT behaviour that this task changes. When this task lands, update the page: section 4, the bullet 'Approve only after you have seen it work. Approval is a human decision.'. In short: mention the opt-in approval policy and what stays human. Keep the page accurate rather than aspirational; if this task is declined, leave the page as is. (This replaces the open task 0689, which is being removed.)

## Activity

- 2026-10-05T16:58:55Z · created · unknown
- 2026-10-05T17:17:10Z · story
- 2026-10-05T17:17:11Z · body: section Story context
- 2026-10-05T17:32:27Z · body: section Docs follow-up
- 2026-10-05T21:20:28Z · status inbox→ready
- 2026-10-05T21:20:31Z · cli_override, model_override
