---
id: "0347"
title: repoos serve process title should include the managed project name
type: feature
status: inbox
priority: p3
area: server
assigned_to: ai
created_by: ""
branch: ""
model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-09-15T06:42:59Z"
updated_at: "2026-09-15T06:44:32Z"
---
## Problem

Every `repoos serve` process shows up in `ps`/Activity Monitor as a bare
`bun /Users/nick/.bun/bin/repoos serve` (or `bun dist/cli/index.js serve
--port N`) — there is nothing in the process list itself that says which
managed project a given instance belongs to.

This made diagnosing #0345 unnecessarily slow: three `repoos serve`
processes were running concurrently (repoos itself, squishy, and an
unrelated grid-viewer instance), and telling them apart required cross-
referencing `lsof -p <pid>` for cwd and hitting `/api/config` on each
port to read back `root`. A human (or an agent) debugging "why is my MTD
timing out, is something else on this machine competing for resources"
should be able to answer that from `ps` alone.

## Proposed fix

Set the process title (`process.title` in Bun/Node) when `repoos serve`
starts, to something like `repoos-<project-name>` — derived from the
managed root's directory name or `package.json` name, whichever is
already used elsewhere for display purposes (check `src/core/config.ts`
and the UI's own project-name resolution so this doesn't invent a second
naming scheme). Confirm `ps aux` / Activity Monitor actually reflect a
Bun-set `process.title` change on macOS before committing to this
approach — Node/Bun process-title support varies by platform, so verify
rather than assume.

Out of scope: renaming the `--port` flag or changing anything about port
selection/allocation — this is a display-only change to make already-
running instances legible, not a process-management feature.

## Acceptance criteria

- [ ] Starting `repoos serve` for a project sets a process title that
      identifies the project (e.g. `repoos-squishy`, `repoos-repoos`).
- [ ] Verified with `ps aux | grep repoos` (or equivalent) on macOS that
      the title actually shows up — not just that `process.title` was set.
- [ ] No change to port binding, CLI flags, or serve behavior — title only.
- [ ] `repoos check` passes.

## Related

- #0345 — diagnosed a squishy MTD failure; discovering the naming gap
  triggered this task while checking whether a long-running
  `repoos serve` was stray or legitimate before killing it.

## Activity

- 2026-09-15T06:42:59Z · created · unknown
- 2026-09-15T06:44:32Z · model_override
