---
id: "0363"
title: Tighten isPreviewProcess's custom-command orphan match beyond bare binary basename
type: bug
status: inbox
priority: p3
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-16T02:09:23Z"
updated_at: "2026-09-16T02:09:23Z"
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
