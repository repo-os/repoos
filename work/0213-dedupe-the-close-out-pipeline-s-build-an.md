---
id: "0213"
title: Dedupe the close-out pipeline's build and browser/server launches
type: feature
status: review
needs_merge: true
priority: p3
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-15T05:57:16Z"
updated_at: "2026-08-16T13:55:44Z"
---
## Problem

This is the narrow remainder of #0075 (deleted — that task's other concerns, a blocking `/done` request and lack of live progress, were superseded by #0118, #0199, and #0204, which already made close-out non-blocking and SSE-driven via `jobCoordinator` + `task.progress` events). Two real, measured inefficiencies from #0075 were never actually fixed and still reproduce today:

1. **Duplicate full build.** `completeTask` (`src/server/done.ts`, `BUILD_STEPS`, ~line 463) runs `bun run build` explicitly. Immediately after, it runs `repoos check` (line 502), whose own "Full build" step (`src/commands/check.ts:358-359`) unconditionally runs `bun run build` again from scratch. That's a second full build every close-out for no reason — nothing changed in between.
2. **Duplicate browser + server launch.** `scripts/capture-screenshots.mjs` launches its own Playwright webkit browser (`playwright.webkit.launch`, line ~103) against its own ephemeral server (`startServer`) to capture screenshots. `runUISmokeTest` in `src/commands/check.ts` (~line 461) independently does the exact same thing — its own webkit launch, its own ephemeral server — to verify the same built UI. Two full browser/server launch cycles where one could serve both jobs.

## Desired behavior

- `completeTask` builds once. `repoos check`'s internal "Full build" step must be skippable when the caller (the close-out pipeline) already just built with nothing changed since — an internal flag/env var passed only by the close-out path is fine. `repoos check` run standalone from the CLI must always still build; do not weaken that path, since agents rely on it as their definition-of-done gate before requesting review.
- Screenshot capture and the UI smoke test share a single browser + server launch instead of two independent ones. If a full merge isn't practical in scope, at minimum reuse the same ephemeral server (still two browser launches is an acceptable partial win — call that out explicitly in the PR if you scope it down).

## Acceptance criteria

- [ ] A full close-out (`/done`) performs exactly one `bun run build`, not two — verify by instrumenting or timing, not just reading the code.
- [ ] `repoos check` run standalone from the CLI (no close-out flag set) is completely unchanged — still always builds.
- [ ] Screenshot capture and the UI smoke test share one browser and/or one ephemeral server launch (see scope-down note above if a full merge isn't practical).
- [ ] `repoos check` passes; note the before/after wall-clock time for a full move-to-done in the PR description.

## Notes for AI

- Files to touch: `src/server/done.ts` (`BUILD_STEPS`, `checkCandidates`, `completeTaskLocked`), `src/commands/check.ts` (`cmdCheck`, the "Full build" heading, `runUISmokeTest`), `scripts/capture-screenshots.mjs`.
- Do not touch the async/SSE/job-coordinator machinery — that part of #0075's original scope is done and owned by #0118/#0199/#0204. This task is scoped purely to the redundant build and redundant browser/server launches.
- Note there's a pre-existing `// TODO: Fix playwright webkit setup issue — skipping for now` near `runUISmokeTest`'s call site in `check.ts` (~line 437) — investigate whether the smoke test is currently even running before assuming its current behavior is the baseline to preserve.

## Related

- 0075 · Make move-to-done non-blocking and cut duplicate build/browser launches — deleted, superseded; this task carries forward only the still-unfixed build/browser dedup half.
- 0118 · Durable repository-wide integration queue and SHA-validated atomic publication — done; owns the non-blocking job/merge machinery this task must not touch.
- 0199 · (close-out failure surfacing via SSE) — done.
- 0204 · Show dirty main files on move-to-done — done.

## Activity

- 2026-08-15T05:57:16Z · created · unknown
- 2026-08-15T05:59:24Z · status inbox→ready
- 2026-08-16T12:10:59Z · needs_merge
- 2026-08-16T12:31:34Z · status ready→review
