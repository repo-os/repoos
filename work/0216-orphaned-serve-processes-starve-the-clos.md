---
id: "0216"
title: Orphaned serve processes starve the close-out gate and cause false failures
type: bug
status: inbox
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-15T07:06:54Z"
updated_at: "2026-08-15T07:06:54Z"
---
## Problem

272 `repoos serve` processes were found running simultaneously on one developer machine. Nearly all are leftovers: preview servers and test-fixture servers whose roots point at deleted temp directories (`/private/var/folders/.../repoos-release-*`, `.../repoos-autoprev-*`). They are never reaped, so every close-out validation and every test run adds more.

The load they generate makes the close-out gate fail on timing-sensitive tests that pass perfectly well on their own. #0211 failed its gate twice in a row, on a DIFFERENT test each time:

1. `tests/watcher.test.ts:147` — `waitFor` timed out on "deletion detected by reconciliation poll"
2. `tests/repo-store.test.ts:805` — `TypeError: Cannot read properties of undefined (reading 'removeItem')` (localStorage absent)

Both pass in isolation in the candidate worktree, and the FULL suite on the exact candidate merge passes 53 files / 622 tests. So the code was green both times and the gate rejected it anyway. Earlier the same day, `agent-review` and `auto-preview` failed the same way and passed on re-run.

The user-visible effect: "Move to done" fails repeatedly with a different unrelated test each time, and there is no way to tell a real regression from contention noise.

## Desired UX

- Serve/preview processes are reaped when their task or fixture goes away, so they cannot accumulate
- The close-out gate does not fail a branch because the machine was busy

## Acceptance criteria

- [ ] Root cause identified for serve processes surviving their owning task/test — including fixture servers whose root directory no longer exists
- [ ] A serve process whose root directory is gone exits on its own rather than running indefinitely
- [ ] Existing reaper logic (`src/server/serve-reaper.ts`) is audited against this case and extended or fixed to cover it
- [ ] Tests clean up any servers they spawn, including on failure paths
- [ ] The close-out gate distinguishes an infrastructure/timeout failure from a genuine test failure, and does not permanently fail the job on the former
- [ ] Timing-sensitive tests (`watcher`, `repo-store`, `agent-review`, `auto-preview`) are made robust to load, or given deadlines that scale with contention
- [ ] A way to see and clear orphaned serve processes (CLI subcommand or startup sweep)

## Notes for AI

- Reproduce with `ps ax | grep 'dist/cli/index.js serve' | wc -l` after several close-outs and test runs.
- Distinguish the live control-plane server (root = the real repo) from fixture/preview servers (root under a temp dir) before killing anything — a sweep must never kill the user's own server.
- `src/server/serve-reaper.ts` and `src/server/preview.ts` already own preview lifecycle; start there.
- Previews are documented as ephemeral ("they stop when the task leaves active/review"), so surviving processes are a contract violation, not just untidiness.
- Consider whether the validation gate should retry once on failure before marking the job failed, given how expensive a false failure is for the user.

## Related

- #0211 (failed its gate twice on unrelated flaky tests)
- #0215 (the failure message that made these look like merge conflicts)

## Activity

- 2026-08-15T07:06:54Z · created · unknown
