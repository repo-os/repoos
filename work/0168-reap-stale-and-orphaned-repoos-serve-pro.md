---
id: "0168"
title: Reap stale and orphaned repoos serve processes
type: bug
status: done
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/reap-stale-and-orphaned-repoos-serve-pro
created_at: "2026-08-13T13:50:20Z"
updated_at: "2026-08-13T17:33:38Z"
---
## Problem

repoos serve processes accumulate and never get reaped. Observed on 2026-08-13: one 2d14h server still listening on 7172, a 2d13h shim and a 1d22h shim both believing they serve 7171 (only the newest bun process actually held the port), a 1d22h serve on 7175, and three `repoos-reload-*` replacement servers from temp dirs (2d7h) that never self-reaped. All of them share the same `.repoos/sessions/` transcripts and `work/*.md` task files on disk.

This is not just litter. Multiple live servers run their own watchdogs against the same active tasks, so two watchdogs can resume the same task, write watchdog nudge messages and `needs_input` flags into the same transcript and task file concurrently, and spawn competing agent processes. That is a strong candidate for the silent server-side-finalization wedge seen on #0105/#0112/#0118 (finalization logged 'check' then nothing, task stuck active, no error recorded).

## Desired UX

One healthy `repoos serve` per repo. Stale processes are detected and reaped automatically: an old serve that can no longer bind its configured port, an orphaned auto-reload replacement that outlives its parent's task lifecycle, and leftover preview children are cleaned up so they cannot keep mutating shared state. The user never sees 'which server am I talking to' ambiguity.

## Acceptance criteria

- [ ] `repoos serve` refuses to silently coexist with a live server on the same port: if the port is already bound, it exits with a clear message (and does not keep running idle).
- [ ] Auto-reload replacement servers are guaranteed to shut down when the parent serve exits (surviving `repoos-reload-*` temp-dir processes are gone after a reload cycle).
- [ ] Stale/abandoned serve processes from prior sessions are identified and reaped (e.g. a liveness/PID registry or lockfile under `.repoos/`), with a safe path for the user to inspect and clean up.
- [ ] Preview children are reaped when their task leaves active/review (one leaked preview child was observed running 3h49m from a worktree).
- [ ] A test covers the reaper, and `repoos check` passes.

## Notes for AI

- Reproduction: start several `repoos serve --port 7171` and `--port 7172/7173/7175` instances over days, run auto-reload cycles, then inspect `ps`.
- The danger is concurrent writers to `.repoos/sessions/*.json` and task files, so the fix should aim for a hard guarantee: at most one live server per repo root.
- Keep the zero-runtime-dependency constraint; a lockfile + PID + stale-lock detection is the likely shape.

## Activity

- 2026-08-13T13:50:20Z · created · unknown
- 2026-08-13T14:00:12Z · status inbox→ready
- 2026-08-13T14:57:03Z · status ready→active, branch
- 2026-08-13T15:07:55Z · status active→review
- 2026-08-13T17:33:38Z · status review→done, release:success
