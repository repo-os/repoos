---
updated_at: "2026-09-16T17:31:24Z"
review_passes: 2
id: "0377"
title: Make bun run build staleness-aware by default
type: feature
status: review
priority: p2
area: core
assigned_to: ai
created_by: hello@repoos.org
branch: feat/make-bun-run-build-staleness-aware-by-de
created_at: "2026-09-16T08:58:32Z"
review_rounds: 1
---
## Problem

`bun run build` always does a full rebuild, even when nothing has changed. Measured at ~5s for a no-op rebuild against a completely fresh `dist/`, versus ~0.1s to just run the staleness check and skip. There is no skip-if-unchanged logic in the build command itself.

This is not merely a performance nicety — it has already caused a real regression. The same "should I actually rebuild?" decision is currently solved in three independent places:

- `repoos check`'s build step has a skip mechanism, but it is a private, caller-only opt-in (`REPOOS_SKIP_BUILD=1`) set exclusively by the MTD orchestrator (`src/server/integration-orchestrator.ts`) and invisible to anyone running `bun run build` directly.
- `preview.ts` used to have its own staleness check (`ensureFreshBuild`, built on `checkBuildForRoot`) for task previews, but that was deleted when task #0370 removed the old special-cased `"repoos"` preview target.
- A third, independently reimplemented staleness check had to be written into a new wrapper script (`scripts/preview-serve.mjs`) just to restore the old preview speed.

The deletion of the preview staleness check meant this repo's own default `[preview]` command started rebuilding unconditionally, turning every preview from ~1s into ~5s+ with zero benefit. The three-way duplication is exactly the kind of gap that produces this bug again in some fourth caller nobody has thought of yet.

## Desired UX

`bun run build` becomes staleness-aware by default: it reuses the existing cheap check (`checkBuildForRoot` in `src/core/build.ts`) and skips the rebuild when `src/` has not changed since the last build. A no-op `bun run build` on an unchanged tree returns in roughly the ~0.1s staleness-check time rather than ~5s.

There is an explicit escape hatch for the rare case where someone genuinely wants to rebuild regardless: a `--force` flag or an env var matching the codebase's existing `REPOOS_SKIP_*` naming — e.g. `REPOOS_FORCE_BUILD=1`.

With `bun run build` smart on its own, `check.ts`'s bespoke `REPOOS_SKIP_BUILD` plumbing and the `scripts/preview-serve.mjs` wrapper likely both become unnecessary and can simplify back down to a plain `bun run build && ...` — but only after verifying that simplification is actually safe.

## Acceptance criteria

- [ ] `bun run build` skips the rebuild when `src/` is unchanged since the last build, reusing `checkBuildForRoot` rather than a new reimplementation.
- [ ] A no-op `bun run build` on an unchanged tree completes in staleness-check time (~0.1s), not full-rebuild time (~5s).
- [ ] A genuinely stale build still rebuilds correctly, and `dist/.build-info.json` is updated as before.
- [ ] `REPOOS_FORCE_BUILD=1` (and/or a `--force` flag) forces a full rebuild even when nothing changed.
- [ ] `repoos check` still reports staleness first and then fixes it within the same invocation, preserving the deliberate self-resolving ordering from #0276 — a genuinely stale build is still surfaced, never silently absorbed.
- [ ] The leftover duplication is removed or justified: `scripts/preview-serve.mjs` and `check.ts`'s `REPOOS_SKIP_BUILD` plumbing are simplified away where verified safe, or an explicit note explains why each remains.
- [ ] `repoos check` passes.

## Notes for AI

- Start from `checkBuildForRoot` in `src/core/build.ts` — it already performs this check cheaply; do not write a fourth implementation.
- Read the self-resolving staleness design documented in #0276 before changing ordering. The contract is: staleness check runs and reports first, then the build step runs and repairs within the same `repoos check` invocation. Do not let the new default skip silently absorb a stale build in that path.
- Files to touch/consider: `src/core/build.ts` (build command / `checkBuildForRoot`), `src/commands/check.ts` (`REPOOS_SKIP_BUILD`), `src/server/integration-orchestrator.ts` (the only setter of that flag), `scripts/preview-serve.mjs` (the temporary wrapper), and any `preview.ts` staleness path.
- Verify simplification is safe before deleting anything. The wrapper and the `REPOOS_SKIP_BUILD` plumbing *likely* become redundant, but treat that as a hypothesis to confirm, not a fact — the user explicitly asked for verification rather than assumption.
- Naming: follow the existing `REPOOS_SKIP_*` env-var convention; `REPOOS_FORCE_BUILD=1` is the suggested form (a `--force` flag is an acceptable alternative or addition).
- Assumption: this is a self-modifying change (it alters the build that RepoOS itself uses), so re-run a clean build and `repoos check` after the change, including the stale-then-fixed ordering case.
- `dist/` is gitignored and must never be committed; use the AGENTS.md runtime conventions (`bun run build`, `bun run test`, no bare `bun test`, no `npx`).

## Scope

Covers: making `bun run build` staleness-aware by default, adding the force escape hatch, and consolidating the duplicated staleness logic where verified safe.

Deferred: broader build-system performance work and any refactor of the MTD orchestrator beyond removing/adjusting the now-redundant `REPOOS_SKIP_BUILD` flag.

## Related

- #0370 — removed the old special-cased `"repoos"` preview target, deleting `preview.ts`'s `ensureFreshBuild`.
- #0276 — self-resolving staleness design (`repoos check` reports first, then fixes).

## Original prompt

bun run build always does a full rebuild, even when nothing changed — measured at ~5s for a no-op rebuild with a completely fresh dist/, versus ~0.1s to just check staleness and skip. There's no skip-if-unchanged logic in the build command itself.

This isn't just a nice-to-have — it already caused a real regression. repoos check's own build step does have a skip mechanism (REPOOS_SKIP_BUILD=1), but it's a private, caller-only opt-in set exclusively by the MTD orchestrator (src/server/integration-orchestrator.ts) — invisible to anyone else running bun run build directly. preview.ts used to have its own separate staleness check (ensureFreshBuild, using checkBuildForRoot) for task previews, but that got deleted when task #0370 removed the old special-cased "repoos" preview target. The result: this repo's own default [preview] command started always rebuilding unconditionally, turning every preview from ~1s into ~5s+ with zero benefit. I had to patch it by writing a third, independent reimplementation of the same staleness check into a new wrapper script (scripts/preview-serve.mjs) just to restore the old speed.

Three places now independently solve "should I actually rebuild": check.ts's internal flag, the since-deleted ensureFreshBuild, and my new wrapper script. That's real duplication, and it's exactly the kind of gap that produces this bug again in some fourth caller nobody's thought of yet.

Proposed fix: make bun run build itself staleness-aware by default (reuse checkBuildForRoot in src/core/build.ts, which already does this check cheaply), skipping the rebuild when src/ hasn't changed since the last one. Add an explicit force option (a --force flag or an env var matching this codebase's existing REPOOS_SKIP_* naming, e.g. REPOOS_FORCE_BUILD=1) for the rare case someone genuinely wants to rebuild regardless.

Needs care, not a quick bolt-on: this interacts with repoos check's existing "self-resolving staleness" design (task/doc reference: #0276) — the deliberate ordering where the staleness check runs and reports first, then the build step runs and fixes it within the same invocation, so a genuinely stale build is still caught and surfaced rather than silently absorbed. Once bun run build is smart on its own, check.ts's bespoke REPOOS_SKIP_BUILD plumbing and my preview-serve.mjs wrapper likely both become unnecessary and could simplify back down to a plain bun run build && ... — but verify that simplification is actually safe before doing it, rather than assuming.

## Activity

- 2026-09-16T08:58:32Z · created · hello@repoos.org
- 2026-09-16T08:58:44Z · status draft→inbox, title, area, body
- 2026-09-16T08:59:17Z · status inbox→ready
- 2026-09-16T08:59:26Z · status ready→active, branch
- 2026-09-16T17:08:02Z · status active→review
- 2026-09-16T17:14:59Z · status review→active
- 2026-09-16T17:26:31Z · status active→review

