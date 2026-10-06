---
id: "0688"
title: "CTO with a short allowlist of safe actions (restart stalled agent, refresh install, re-queue close-out)"
type: feature
status: active
priority: p3
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/cto-with-a-short-allowlist-of-safe-actio
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-05T16:58:59Z"
updated_at: "2026-10-06T02:49:30Z"
---
## Problem

The CTO only reports ("never move a task to done, merge branches, delete worktrees, change config, or spend money"). In practice the corrective actions needed repeatedly were safe and mechanical: restart an agent that stalled, run the install in main after a lockfile change, re-queue a close-out after an environment fix. A human or a driver script did them every time.

## Desired UX

An opt-in `[cto.actions]` allowlist (default empty) of named, bounded actions the CTO may take, each with a rate limit and an audit entry in the bell: `restart-stalled-agent`, `refresh-main-install`, `requeue-closeout-after-env-fix`. Merging, approving, deleting and config changes stay out of scope.

## Acceptance criteria

- Each action implemented as a normal server function (also usable from the UI), allowlist enforced server-side, rate limited, audited, tested with stubs. Settings UI control and docs. `repoos check` passes.

See also: close-out dependency handling; provider failures; approval policy.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read that file first: it holds the background of the run that produced this task, the facts already established for your theme (with the evidence), the decisions the owner has already made, the known uncertainties, and the list of sibling tasks you should coordinate with. Verify its facts against the current source before relying on them, and say in the task notes if you find anything in it that is wrong or out of date.

## Activity

- 2026-10-05T16:58:59Z · created · unknown
- 2026-10-05T17:17:15Z · story
- 2026-10-05T17:17:16Z · body: section Story context
- 2026-10-06T02:10:14Z · status inbox→ready
- 2026-10-06T02:10:15Z · cli_override, model_override
- 2026-10-06T02:10:16Z · status ready→active, branch
- 2026-10-06T02:33:45Z · body
- 2026-10-06T02:49:30Z · body
