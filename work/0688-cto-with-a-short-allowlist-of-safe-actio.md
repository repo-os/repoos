---
id: "0688"
title: "CTO with a short allowlist of safe actions (restart stalled agent, refresh install, re-queue close-out)"
type: feature
status: inbox
priority: p3
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-10-05T16:58:59Z"
updated_at: "2026-10-05T16:58:59Z"
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

## Activity

- 2026-10-05T16:58:59Z · created · unknown
