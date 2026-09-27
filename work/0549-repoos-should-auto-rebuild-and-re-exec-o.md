---
id: "0549"
title: "repoos should auto-rebuild-and-re-exec on stale dist/, not just warn"
type: feature
status: inbox
priority: p2
area: cli
assigned_to: ai
created_by: ""
branch: ""
cli_override: codex
model_override: default
created_at: "2026-09-27T13:20:14Z"
updated_at: "2026-09-27T13:30:15Z"
---
## Problem

Every `repoos` invocation immediately after a `src/` edit that hasn't been
followed by `bun run build` fails once on the `staleness` check step, even
though that very same invocation's own `build` step (later in the check
plan) would refresh `dist/` a few steps later. The human/agent has to burn
an entire second full `repoos check` run just to see a clean pass. Confirmed
live, repeatedly, in an agent session on 2026-09-27 — described in AGENTS.md
(just updated, see below) as "the #1 way to waste time in this repo."

AGENTS.md's guidance (the "self-hosted" section) now explicitly tells
agents to be proactive — `bun run build` right after every edit, before the
next `repoos` call — but that's a discipline fix on the caller's side, not a
guarantee. An agent (or human) that forgets still pays the cost every time.

## Why this can't just be "reorder the check-plan steps" or "auto-build
## inline mid-run" (already ruled out, don't relitigate)

`repoos check`'s `staleness` step exists to catch the CLI process itself
running old compiled code (`dist/cli/index.js`) — not just a stray unused
build artifact. The process invoked as `repoos check` loads its own code
(including `check.ts`'s own step logic) at startup; running `bun run build`
as a subprocess partway through that SAME process's lifetime writes a fresh
`dist/` to disk, but cannot retroactively change the code already loaded
into memory for the rest of that process's own run. Reordering `build`
before `staleness` (or auto-building inline the moment staleness is
detected) would silence the warning without fixing what it's actually
warning about: THIS invocation may still be running stale logic. That's why
the current design intentionally hard-fails rather than self-healing inline.

## The actual fix: rebuild-and-re-exec, mirroring the existing Bun re-exec
## pattern

`reexecUnderBunIfRequested()` (`src/core/runtime.ts:105`) already solves the
analogous problem for a DIFFERENT stale-process concern (wrong JS runtime):
detect the mismatch as the very first action before any real work begins,
then re-exec (prefer true `exec` — same PID, no wrapper — see the function's
own comment on "Preferred: true exec") into a corrected process, guarded by
a `REPOOS_RUNTIME_REEXEC=1` env var so it only ever attempts once (never an
infinite loop). `bunfig.toml`'s `[run] bun = true` and the install launcher
use the same idea.

Apply the identical shape to build staleness, in the CLI entrypoint
(`src/cli/index.ts`), before command dispatch:

1. On startup, call `checkBuildForRoot(root)` (`src/core/build.ts:98` —
   already exists, already used by `stepStaleness`).
2. If stale and applicable, and `process.env.REPOOS_STALENESS_REEXEC` is not
   already `"1"` (exactly one attempt, same guard shape as the Bun re-exec):
   run `bun run build` synchronously (inherit stdio so the human/agent sees
   it happen), then re-exec the SAME command/argv with
   `REPOOS_STALENESS_REEXEC=1` set — a genuinely fresh process now loads the
   just-rebuilt `dist/cli/index.js`, so `stepStaleness` in that process
   passes cleanly because the code really is fresh, not because the check
   was skipped or reordered.
3. If the rebuild itself fails, or staleness somehow still shows after one
   rebuild-and-re-exec attempt, fall through to today's behavior (hard fail
   with the existing message) rather than looping.
4. This should apply broadly — not just `repoos check` — since ANY `repoos`
   subcommand run against stale `dist/` risks running outdated logic; scope
   the actual trigger point to wherever `reexecUnderBunIfRequested()` is
   currently called from, so both re-exec concerns (runtime + staleness) sit
   together and compose (the two guard env vars are independent, so either
   or both can fire in one bootstrap without conflict).

## Acceptance criteria

- Editing `src/` then immediately running any `repoos` command (not just
  `check`) transparently rebuilds once and re-execs into fresh code, with no
  separate manual `bun run build` step needed and no silent staleness
  masking.
- Exactly one re-exec attempt ever, verified by a test that stale dist/ +
  a build that (deliberately, in the test) doesn't clear the staleness hash
  does not loop.
- `repoos serve` also benefits (AGENTS.md's own staleness message calls out
  "repoos serve serves the OLD UI" as a named risk).
- Existing `stepStaleness` behavior (hard-fail with today's message) is
  preserved as the fallback when the one re-exec attempt doesn't resolve it.
- Test coverage for the new bootstrap logic, following the existing
  `reexecUnderBunIfRequested()` tests (if any) as the pattern to match.

## Out of scope

- Reordering `repoos.toml`'s check-plan step order — ruled out above, not a
  fix.
- Making `staleness` a soft warning instead of a hard fail — that defeats
  its actual purpose (see the "why this can't just be" section above).

## Activity

- 2026-09-27T13:20:14Z · created · unknown
- 2026-09-27T13:30:15Z · cli_override, model_override
