---
id: "0703"
title: "init for the `repoos/` layout: set `storiesDir`, ignore `node_modules/` and `.env*.local`"
type: feature
status: active
priority: p2
area: cli
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/init-for-the-repoos-layout-set-storiesdi
created_at: "2026-10-06T03:15:57Z"
updated_at: "2026-10-07T16:58:42Z"
---
## Problem

tuk-private uses `workDir = "repoos/work"` and `docsDir = "repoos/docs"`, but stories land in a top-level `stories/` because `storiesDir` defaults to `stories` and init does not set it for this layout. Init's `.gitignore` also lacks `node_modules/`, so after the first `bun install` `repoos status` reports `git main · dirty (3 files)` and Move to done may refuse.

## Desired UX

A `repoos/` layout keeps all RepoOS files under `repoos/`; a fresh project's main stays clean after installing dependencies.

## Acceptance criteria

- [ ] When init writes the `repoos/` layout it also writes `storiesDir = "repoos/stories"` (and any other layout keys with top-level defaults).
- [ ] The init `.gitignore` template includes `node_modules/` and `.env*.local`.
- [ ] `repoos doctor` warns when `workDir` is under a subfolder but `storiesDir` is top-level (suggesting the move, never doing it).
- [ ] Tests in the init scaffold suite.

## Notes for AI

Evidence: `~/code/tuk/tuk-private/repoos/docs/repoos-feedback.md` (tuk-private run, 2026-10-06), item 12, 13.

## Activity

- 2026-10-06T03:15:57Z · created · unknown
- 2026-10-07T16:44:44Z · status inbox→ready
- 2026-10-07T16:44:53Z · status ready→active, branch
- 2026-10-07T16:51:35Z · body
- 2026-10-07T16:58:42Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
