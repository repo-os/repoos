---
id: "0377"
title: "bun run build always does a full rebuild, even when nothi…"
type: feature
status: draft
priority: p2
area: general
assigned_to: ""
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-16T08:58:32Z"
updated_at: "2026-09-16T08:58:32Z"
---
bun run build always does a full rebuild, even when nothing changed — measured at ~5s for a no-op rebuild with a completely fresh dist/, versus ~0.1s to just check staleness and skip. There's no skip-if-unchanged logic in the build command itself.

This isn't just a nice-to-have — it already caused a real regression. repoos check's own build step does have a skip mechanism (REPOOS_SKIP_BUILD=1), but it's a private, caller-only opt-in set exclusively by the MTD orchestrator (src/server/integration-orchestrator.ts) — invisible to anyone else running bun run build directly. preview.ts used to have its own separate staleness check (ensureFreshBuild, using checkBuildForRoot) for task previews, but that got deleted when task #0370 removed the old special-cased "repoos" preview target. The result: this repo's own default [preview] command started always rebuilding unconditionally, turning every preview from ~1s into ~5s+ with zero benefit. I had to patch it by writing a third, independent reimplementation of the same staleness check into a new wrapper script (scripts/preview-serve.mjs) just to restore the old speed.

Three places now independently solve "should I actually rebuild": check.ts's internal flag, the since-deleted ensureFreshBuild, and my new wrapper script. That's real duplication, and it's exactly the kind of gap that produces this bug again in some fourth caller nobody's thought of yet.

Proposed fix: make bun run build itself staleness-aware by default (reuse checkBuildForRoot in src/core/build.ts, which already does this check cheaply), skipping the rebuild when src/ hasn't changed since the last one. Add an explicit force option (a --force flag or an env var matching this codebase's existing REPOOS_SKIP_* naming, e.g. REPOOS_FORCE_BUILD=1) for the rare case someone genuinely wants to rebuild regardless.

Needs care, not a quick bolt-on: this interacts with repoos check's existing "self-resolving staleness" design (task/doc reference: #0276) — the deliberate ordering where the staleness check runs and reports first, then the build step runs and fixes it within the same invocation, so a genuinely stale build is still caught and surfaced rather than silently absorbed. Once bun run build is smart on its own, check.ts's bespoke REPOOS_SKIP_BUILD plumbing and my preview-serve.mjs wrapper likely both become unnecessary and could simplify back down to a plain bun run build && ... — but verify that simplification is actually safe before doing it, rather than assuming.

## Original prompt

bun run build always does a full rebuild, even when nothing changed — measured at ~5s for a no-op rebuild with a completely fresh dist/, versus ~0.1s to just check staleness and skip. There's no skip-if-unchanged logic in the build command itself.

This isn't just a nice-to-have — it already caused a real regression. repoos check's own build step does have a skip mechanism (REPOOS_SKIP_BUILD=1), but it's a private, caller-only opt-in set exclusively by the MTD orchestrator (src/server/integration-orchestrator.ts) — invisible to anyone else running bun run build directly. preview.ts used to have its own separate staleness check (ensureFreshBuild, using checkBuildForRoot) for task previews, but that got deleted when task #0370 removed the old special-cased "repoos" preview target. The result: this repo's own default [preview] command started always rebuilding unconditionally, turning every preview from ~1s into ~5s+ with zero benefit. I had to patch it by writing a third, independent reimplementation of the same staleness check into a new wrapper script (scripts/preview-serve.mjs) just to restore the old speed.

Three places now independently solve "should I actually rebuild": check.ts's internal flag, the since-deleted ensureFreshBuild, and my new wrapper script. That's real duplication, and it's exactly the kind of gap that produces this bug again in some fourth caller nobody's thought of yet.

Proposed fix: make bun run build itself staleness-aware by default (reuse checkBuildForRoot in src/core/build.ts, which already does this check cheaply), skipping the rebuild when src/ hasn't changed since the last one. Add an explicit force option (a --force flag or an env var matching this codebase's existing REPOOS_SKIP_* naming, e.g. REPOOS_FORCE_BUILD=1) for the rare case someone genuinely wants to rebuild regardless.

Needs care, not a quick bolt-on: this interacts with repoos check's existing "self-resolving staleness" design (task/doc reference: #0276) — the deliberate ordering where the staleness check runs and reports first, then the build step runs and fixes it within the same invocation, so a genuinely stale build is still caught and surfaced rather than silently absorbed. Once bun run build is smart on its own, check.ts's bespoke REPOOS_SKIP_BUILD plumbing and my preview-serve.mjs wrapper likely both become unnecessary and could simplify back down to a plain bun run build && ... — but verify that simplification is actually safe before doing it, rather than assuming.

## Activity

- 2026-09-16T08:58:32Z · created · hello@repoos.org
