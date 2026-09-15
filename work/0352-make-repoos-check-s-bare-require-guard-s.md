---
updated_at: "2026-09-15T22:55:23Z"
review_passes: 1
id: "0352"
title: Make repoos check's bare-require guard scan configurable source roots
type: feature
status: review
priority: p3
area: cli
assigned_to: ai
created_by: ""
branch: feat/make-repoos-check-s-bare-require-guard-s
created_at: "2026-09-15T09:22:38Z"
---
## Problem

Found in the #0348 audit of `repoos check` steps
(`docs/audits/2026-09-check-step-genericity-audit.md`, section 3). This doc
lands on `main` when #0348 closes out.

The guard exists because in a `"type": "module"` package, a bare `require`
works in dev but breaks once compiled to ESM. That applies to any such
package. But `bareRequireOffenders()` in `src/commands/check.ts` only walks
the fixed directories `src/{core,server,commands,cli}`, which is RepoOS's own
layout. In a managed project with a different layout it scans nothing and
passes without checking anything.

## Direction

Get the directories to scan from the project instead of hardcoding them: a
`[check]` setting in `repoos.toml`, or the `include` list from the repo's
`tsconfig`. Also only run the guard for `"type": "module"` packages, since
that's the only case it's about.

## Acceptance criteria

- [ ] A project with a non-RepoOS source layout gets its own source files
      scanned.
- [ ] Packages that aren't `"type": "module"` skip with a clear message.
- [ ] RepoOS's own coverage doesn't change.
- [ ] `repoos check` passes.

## Related

- #0348, where the audit found this

## Activity

- 2026-09-15T09:22:38Z · created · unknown
- 2026-09-15T19:14:40Z · status inbox→ready
- 2026-09-15T22:35:33Z · status ready→active, branch
- 2026-09-15T22:52:36Z · status active→review

