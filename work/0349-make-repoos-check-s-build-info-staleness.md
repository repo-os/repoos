---
id: "0349"
title: Make repoos check's build-info staleness step degrade to a skip for projects not using RepoOS's build
type: bug
status: inbox
priority: p1
area: cli
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-15T09:22:33Z"
updated_at: "2026-09-15T09:22:33Z"
---
## Problem

Found in the #0348 audit of `repoos check` steps
(`docs/audits/2026-09-check-step-genericity-audit.md`, section 6). This doc
lands on `main` when #0348 closes out.

The first step of `repoos check`, the build staleness check
(`checkBuildForRoot()` in `src/core/build.ts`), assumes the repo is built the
way RepoOS builds itself:

- `published` (skip) when there's no `src/`. Fine for non-CLI projects.
- `no-build`: stale, so **FAIL**, when `src/` exists but `dist/` doesn't.
- `no-marker`: stale, so **FAIL**, when `dist/` exists without `dist/.build-info.json`.

Only RepoOS's own `bun run build` writes that marker. A managed project that
has a `src/` directory but a different build pipeline (output somewhere other
than `dist/`, or a build that never writes `.build-info.json`) hard-fails
`repoos check` even though nothing is wrong. Of the steps audited in #0348,
this is the only one that can fail a non-RepoOS project, not just skip it.

## Direction

Make this step opt-in, or have it fall back to a skip when the project isn't
using RepoOS's build pipeline. Key it off something the project actually has,
such as the marker file itself or a `[check]` setting in `repoos.toml`. Use
the same `[check]` section #0348 added for `uiSmoke`. Don't key it off
`package.json` `name === "repoos"`: #0348 got rid of that special case for
`ui-smoke`, and it shouldn't come back.

## Acceptance criteria

- [ ] A project with `src/` and no RepoOS-style `dist/.build-info.json` skips
      this step with a clear message instead of failing.
- [ ] RepoOS's own repo still fails the step when `dist/` is genuinely stale.
- [ ] Tests cover both paths.
- [ ] `repoos check` passes.

## Related

- #0348, where the audit found this
- #0276, which set up local-CLI-first selection using this marker

## Activity

- 2026-09-15T09:22:33Z · created · unknown
