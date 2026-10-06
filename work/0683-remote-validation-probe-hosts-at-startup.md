---
id: "0683"
title: "Remote validation: probe hosts at startup, say when a job fell back to local, document the runner image"
type: bug
status: active
priority: p2
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/remote-validation-probe-hosts-at-startup
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-05T16:58:48Z"
updated_at: "2026-10-06T04:49:50Z"
---
## Problem

Enabled the tailscale host pool for a project (same three hosts as RepoOS). `POST /api/remote-validation/test` returned `REPOOS_PREREQ_OK` on two hosts (a third was offline), but NO close-out ever ran remotely: later close-outs show `machine=<laptop>, remote=0` in `check_runs`, and `GET /api/remote-validation/status` still reported every host `probed: false, healthy: false` hours later. `fallbackToLocal = true` hid it. Hypothesis (unverified, from the docs: "Samples run while the tab is open"): host health is only probed while the Checks > Remote runners tab is open in the UI and dispatch needs a healthy host, so an unattended server never uses the pool.
Related findings:
- `repoos-ci` is the RepoOS repo's own gate image (generic Bun/git/Node contents, no Postgres) and `validate.sh` hard-codes the in-container command (`bun install --frozen-lockfile && bun run build && <repoos dist shim> && bun run test`). A project that needs a database must ship its own image, built by hand per host (different CPU architectures), and RepoOS's pre-flight runs `docker run -u 0 <image> chown ...` BEFORE the entrypoint logic, so a project image must pass through when run as root. None of this is documented.

## Desired UX

- Probe hosts on server start and on a timer (or lazily at dispatch time).
- If remote is enabled and a job runs locally, record why in the close-out record and show it in the bell ("ran locally: no healthy runner").
- Document: the gate command is fixed; how to bring a project image (root pass-through, arch per host); optionally add `remoteValidation.command` and a `repoos runner build-image <dir>` helper that builds the image on every pool host.

## Acceptance criteria

- Test: with hosts configured but UI closed, a close-out dispatches remotely (stub runner) or records the fallback reason. Docs updated. `repoos check` passes.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read that file first: it holds the background of the run that produced this task, the facts already established for your theme (with the evidence), the decisions the owner has already made, the known uncertainties, and the list of sibling tasks you should coordinate with. Verify its facts against the current source before relying on them, and say in the task notes if you find anything in it that is wrong or out of date.

## Docs follow-up
The playbook page `user-docs/running-with-agents.md` (landed on main) describes the CURRENT behaviour that this task changes. When this task lands, update the page: section 3, the bullet 'confirm remote runners are really being used; a silent fall-back to local looks the same as success'. In short: describe the new probe and the visible fall-back notice. Keep the page accurate rather than aspirational; if this task is declined, leave the page as is. (This replaces the open task 0689, which is being removed.)

## Activity

- 2026-10-05T16:58:48Z · created · unknown
- 2026-10-05T17:17:02Z · story
- 2026-10-05T17:17:04Z · body: section Story context
- 2026-10-05T17:32:25Z · body: section Docs follow-up
- 2026-10-05T17:33:07Z · note: Owner update (2026-10-06): the 'bee' host had an expired login (Tailscale re-auth needed); the owner re-logged in. That is one concrete reason a host reads as unhealthy/unreachable, so the probe and the fall-back notice should name it ('host unreachable: Tailscale login expired?') instead of just 'not healthy'. The owner will retry remote validation on the next project run; the unexplained part (thinkpad and mini passed the prerequisite test yet no close-out dispatched remotely) is still open and still unverified.
- 2026-10-06T01:49:28Z · status inbox→ready
- 2026-10-06T01:49:29Z · cli_override, model_override
- 2026-10-06T01:49:29Z · status ready→active, branch
- 2026-10-06T02:11:13Z · body
- 2026-10-06T02:26:25Z · body
- 2026-10-06T02:59:41Z · body
- 2026-10-06T04:49:50Z · body
