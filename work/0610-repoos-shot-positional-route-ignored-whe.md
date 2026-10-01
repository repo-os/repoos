---
id: "0610"
title: "repoos shot: positional route ignored when a declared plan or fallback resolves"
type: bug
status: ready
priority: p3
area: [cli, server]
assigned_to: ai
created_by: ""
branch: ""
model_override: opencode-go/space-bunny-free
created_at: "2026-09-30T19:56:49Z"
updated_at: "2026-10-01T07:00:34Z"
---
## Problem

`repoos shot /some-route` with an explicit positional route is silently ignored when target resolution produces entries: `cmdShot` builds `plan = built.entries.length ? built.entries : targets.map(...)` (`src/commands/shot.ts`, the non-absolute branch). Because passing `opts.route` empties `declared.shots`, `built.entries` is the `/`-fallback per target — which wins over the requested route. The capture then shoots `/` instead of the route the engineer typed. Flagged in the #0603 review (pre-existing behavior, reworked block).

## Expected

When the caller passes a positional route (or `--selector`), the CLI's plan should honor it: use the flags-built entry for the resolved target(s), or have `buildCapturePlan` accept a default route/selector so the fallback inherits the requested route instead of hardcoding `/`.

## Notes

- Keep the declared-`## Shots` precedence rule: a route/selector flag currently suppresses the declared list; decide whether flags should override individual declared entries or the whole list, and document it in `user-docs/cli.md` and `repoos shot --help`.
- Add a `parseShotArgs`/plan-level test pinning that a positional route reaches the capture entry.
- Found during #0603 review round 1; behavior predates #0603.

## Activity

- 2026-09-30T19:56:49Z · created · unknown
- 2026-10-01T07:00:33Z · model_override
- 2026-10-01T07:00:34Z · status inbox→ready
