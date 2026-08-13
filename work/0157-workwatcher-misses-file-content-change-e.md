---
id: "0157"
title: WorkWatcher misses file-content-change events; add poll-based reconciliation fallback
type: bug
status: active
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/workwatcher-misses-file-content-change-e
created_at: "2026-08-13T07:04:41Z"
updated_at: "2026-08-13T13:55:27Z"
---
## Activity

- 2026-08-13T07:04:41Z · created · unknown


## Problem

`WorkWatcher` (`src/server/watcher.ts`) is the *only* mechanism that tells the
running server's in-memory `LiveIndex` about task-file changes made by anything
other than the server's own write paths (external edits, `git mv`/rename, a CLI
`repoos new` from a separate process, etc.). It relies solely on native
`fs.watch(dir, { recursive: true }, ...)`, debounced 60ms per path, calling
`index.applyFileChange(absPath)` when it fires.

This misses real content-change events. Confirmed directly on this board: two task
files (#0153, #0156) were edited on disk and committed to git, but the live server
kept serving the old (pre-edit) body indefinitely — `curl /api/tasks/0153` returned a
273-byte stub while the file on disk was 3153 bytes. No error, no lag-then-catch-up:
the server simply never saw the change. A manual `touch` on the file was enough to
make it pick up the already-correct-on-disk content, confirming the watcher, not the
parser or the file content, is what's failing. A third task (#0155) happened to
self-correct only because an unrelated later write (an automatic status-transition
PATCH) forced a resync — that's luck, not a fix.

This is a known class of problem: recursive `fs.watch` (FSEvents-backed on macOS,
this repo's platform) can coalesce or drop events under rapid filesystem activity,
and this session alone generated a lot of it (repeated builds, renames, edits in a
short window). The codebase already has direct prior art for exactly this failure
mode: `ReloadManager` (`src/server/reload.ts`) watches `dist/.build-info.json` and
explicitly does NOT trust `fs.watch` alone — its docstring says so directly, and it
layers a 5s low-frequency poll as "a platform-proof fallback" alongside the watch.
`WorkWatcher` has no equivalent fallback.

Silent staleness here is worse than it looks: it undermines every feature that
assumes the live index reflects disk — including the watchdog work planned in
#0156, which depends on task Activity-log writes being visible to detect and recover
stuck tasks. A watchdog reading a stale index could easily misdiagnose a task's
state.

## Desired UX

The live server's task data should never silently diverge from what's on disk for
more than a few seconds, regardless of what changed the file (editor, CLI, git,
agent, human).

## Acceptance criteria

- [ ] `WorkWatcher` gains a periodic reconciliation pass (mirroring
      `ReloadManager`'s watch+poll pattern in `reload.ts`) — e.g. every 5–10s,
      `statSync` every tracked task file, compare mtime against a small in-memory
      map the watcher maintains, and call `index.applyFileChange(path)` for any
      file whose mtime has moved since the last poll.
- [ ] The same pass also catches new files `fs.watch` missed (not yet in
      `pathToId`) and deletions (`pathToId` entries whose file no longer exists) —
      not just content changes to already-known files.
- [ ] `fs.watch` stays the primary, low-latency path; the poll is a bounded-latency
      safety net only, not a replacement (avoid re-reading/re-parsing every file
      every poll — mtime comparison first, `applyFileChange` only on drift).
- [ ] A regression test: write/modify a task file without going through any
      server-owned write path (simulating an untracked external edit — e.g. an
      `fs.writeFileSync` the test never tells the watcher about directly), and
      assert the index reflects it within the poll window without requiring a
      `touch` or any other nudge.
- [ ] No change to `fs.watch` debounce/dedup behavior for the common case — this is
      additive, not a rewrite of the existing fast path.

## Notes for AI

- Reuse the poll-interval / debounce constants style already in `reload.ts`
  (`DEFAULT_POLL_MS`, etc.) rather than inventing new magic numbers from scratch.
- `LiveIndex` currently has no mtime bookkeeping at all (`applyFileChange` always
  re-reads unconditionally) — the mtime map belongs in `WorkWatcher`, which already
  owns the `work/` directory listing/recursion logic (`watchTree`, `tryRecursive`).
- Don't call `index.refreshAll()` on every poll tick — that's a full rebuild
  (clears and reparses everything) and is the wrong granularity for a routine
  reconciliation pass; use targeted `applyFileChange` calls per drifted path,
  same as the watcher's own event-driven path already does.
- Related but distinct from #0156 (the stuck-active-task watchdog) — that task's
  detection logic reads the live index and needs it to be trustworthy; this task is
  what makes it trustworthy. No hard ordering dependency, but worth landing first
  or together.

## Activity

- 2026-08-13T13:44:13Z · status inbox→ready
- 2026-08-13T13:55:27Z · status ready→active, branch
