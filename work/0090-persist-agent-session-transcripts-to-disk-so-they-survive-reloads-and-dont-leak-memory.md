---
id: "0090"
title: Persist agent session transcripts to disk so they survive reloads and don't leak memory
type: feature
status: done
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/persist-agent-session-transcripts-to-dis
created_at: "2026-08-11T12:30:00Z"
updated_at: "2026-08-12T05:21:59Z"
---
## Problem

Agent chat transcripts live purely in a `Map<string, Session>` in `AgentRunner`
— RAM-only, no disk persistence. When `repoos serve` reloads (task #0066) the
replacement process starts with an empty session map, and every prior chat
vanishes. The reload defers while agents run as a workaround, but that means:

1. When an agent IS running and the reload fires, the new server can't show
   the transcript at all
2. If the server stays up for weeks/months, thousands of sessions accumulate
   in memory with no eviction — a slow leak

`PreviewManager` already persists to `<cacheDir>/previews.json`. Agent sessions
should get the same treatment.

## Desired UX

- Every session transcript is persisted to disk as one JSON file per task:
  `.repoos/sessions/<task-id>.json`
- On boot, the `AgentRunner` loads existing session files (so chat history
  survives any server restart or reload)
- On every line appended to a session, the file is written (debounced, not
  per-line — e.g. 500 ms throttle)
- `GET /api/tasks/:id/output` returns the transcript whether the session is
  hot in RAM or cold on disk (lazy-load from file when needed)
- Completed session files remain available for done-state audit/Q&A for a
  bounded retention window (30 days by default), then are pruned. Completed
  sessions are evicted from RAM promptly so persistence fixes the memory leak
  without immediately destroying useful history.
- Persisted history is distinguished from ownership of a live child process.
  Reload remains deferred while an agent is running unless RepoOS also gains an
  explicit, tested process-adoption or termination protocol; saving a transcript
  alone does not make an in-flight process safe to abandon.

## Acceptance criteria

- [ ] `AgentRunner` serializes `Session` to `<cacheDir>/sessions/<id>.json`
      on every line appended (debounced 500 ms)
- [ ] `AgentRunner.start()` and `AgentRunner.output()` load from disk when
      the in-memory Map doesn't have the session
- [ ] On boot, `AgentRunner` scans `<cacheDir>/sessions/` and pre-loads
      sessions for tasks that are still `active` or `review`
- [ ] The done flow flushes the final session, marks it completed, and evicts it
      from RAM; a bounded age/count retention policy prunes old files from disk.
- [ ] Transcript persistence alone does not remove the live-agent reload
      deferral. Any future immediate-reload path must explicitly adopt or stop
      the child process, preserve streamed output, and keep the runner registry
      accurate without creating an orphan.
- [ ] `GET /api/tasks/:id/output` works for any task that has a session file
      on disk, even if the in-memory Map was flushed
- [ ] Tests: session serialization round-trip, disk load on boot, done-state RAM
      eviction, retention cleanup, and output from disk when no RAM session
- [ ] Session files are versioned and written atomically; a corrupt or partial
      file fails soft without preventing `repoos serve` from starting.
- [ ] `repoos check` passes, including browser smoke

## Notes for AI

- Relevant files: `src/server/agents.ts`, `src/server/reload.ts`,
  `src/server/done.ts`, `src/ui-app/src/views/TaskDrawer.vue` (Agent tab)
- Use the same `cacheDir` resolution as `PreviewManager` (`config.cacheDir`,
  defaults to `.repoos`)
- The session JSON format should include `lines`, `sessionId`, `engine`, and
  `workdir` — enough to resume a turn after reload
- Debounce writes: don't hammer the filesystem on every output line. A
  500ms trailing-throttle per task is fine.
- Use a temporary file plus rename (or an equivalently atomic pattern) so a
  crash during a debounced write cannot poison the next boot.
- `OUTPUT_CAP_BYTES` (256 KiB) applies to the in-memory buffer AND the
  persisted file — prune oldest lines before writing, same logic as today
- Do NOT change the `Session` interface or the SSE streaming shape — this
  is purely a persistence layer under the existing API
- When loading sessions at boot, preload only `active` and `review`. Retained
  done sessions stay cold on disk and are loaded lazily for output/Q&A until
  their retention window expires.

## Related

- 0087 — completed lifecycle cleanup for agents leaving `active`
- 0096 — managed previews and reload isolation; coordinate process ownership
- 0094 — API-first trusted handoff for privileged agent operations

## Activity

- 2026-08-11T12:30:00Z · created · unknown
- 2026-08-11T15:37:46Z · updated · separate transcript persistence from live-process handoff safety
- 2026-08-11T19:01:23Z · status inbox→ready
- 2026-08-11T19:28:09Z · status ready→active, branch
- 2026-08-12T05:21:59Z · status review→done
