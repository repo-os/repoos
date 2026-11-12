---
id: "0363"
title: Tighten isPreviewProcess's custom-command orphan match beyond bare binary basename
type: bug
status: active
priority: p3
area: server
assigned_to: ai
created_by: ""
branch: feat/tighten-ispreviewprocess-s-custom-comman
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-09-16T02:09:23Z"
updated_at: "2026-11-12T18:13:48Z"
handoff_signal_retry_count: 2
---
## Problem

Follow-up from #0362's review. `isPreviewProcess` (`src/server/preview.ts`,
~line 350) identifies a running preview child during boot-time orphan cleanup
by matching its `ps` command line against the recorded resolved command. When
the command doesn't embed `--port {port}` in a way that survives into the
running process's cmdline, the check falls back to matching on the bare
binary basename alone (e.g. `bun`, `node`, `npm`):

```ts
return cmd.includes(`--port ${port}`) || (Boolean(binary) && cmd.includes(binary));
```

If the main server crashes and the OS later reuses that same pid for an
unrelated process whose command line happens to contain that basename (e.g.
the preview binary was `bun`, and the reused pid is now running `bun test`),
boot-time orphan cleanup would kill the wrong, innocent process.

This is a narrow trigger (needs a crash + pid reuse in the cleanup window) and
does not affect this repo's own `repoos serve` fallback (which is matched
structurally, not by this path). Reviewer verdict on #0362 was "good to go"
with this flagged as "worth tightening later," not a blocking defect.

## Desired outcome

Replace the bare-basename fallback with a more distinguishing match — options
to weigh, not prescribed:
- Match a longer prefix of the resolved command (not just the binary name)
against the `ps` output.
- Record a nonce or other unique marker (e.g. an env var set on the spawned
child) and match on that instead of parsing `ps` output at all.
- Require BOTH the binary and at least one additional argument token to
match, rather than the binary alone.

Verify against the actual `ps`/shell-quoting behavior on macOS and Linux
(spawn uses `shell: true`, so `ps` may show the shell wrapper or the exec'd
binary depending on the command and platform) before picking an approach —
this needs real verification, not just a plausible-looking change, since a
subtly wrong fix here risks killing processes it shouldn't.

## Notes for AI

- Relevant code: `isPreviewProcess` in `src/server/preview.ts`.
- Source: `.repoos/reviews/0362.md` edge-cases/suggestions section.
- `repoos check` must pass with no regressions.

## Activity

- 2026-09-16T02:09:23Z · created · unknown
- 2026-10-05T11:15:30Z · needs_input
- 2026-11-12T17:11:34Z · cli_override, model_override
- 2026-11-12T17:11:37Z · status inbox→ready
- 2026-11-12T17:11:39Z · status ready→active, needs_input, branch
- 2026-11-12T17:19:55Z · note: adopted orphaned engineer pid 96832
- 2026-11-12T17:31:12Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code unknown · last assistant: Implemented the stricter fallback in [preview.ts](/Users/nick/code/nick/repoos-worktrees/feat/tighten-ispreviewprocess-s-custom-comman/src/server/preview.ts): when the port is absent from `ps`, a match now requires both the executable base… · stderr: Reading additional input from stdin... 2026-11-12T17:31:07.236741Z ERROR codex_core::session: failed to record rollout items: thread 01a1d0be-671f-7ed3-9ede-242b23fd1c43 not found
- 2026-11-12T17:43:09Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The implementation and report draft are present, but `REPOOS_CHECK_CHANGED=main repoos check` has not returned a result. The recovery run reached remote validation, then remained silent while the runner performed build and tests. I can’t c… · stderr: 2026-11-12T17:31:27.011847Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 33580 2026-11-12T17:43:06.683782Z ERROR codex_core::session: failed to record rollout items: thread 01a1d0be-671f-7ed3-9ede-242b23fd1c43 not found
- 2026-11-12T17:54:55Z · message_queued at 2026-11-12T17:54:55.340Z
- 2026-11-12T17:54:55Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-12T17:59:55Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-12T18:13:48Z · body
