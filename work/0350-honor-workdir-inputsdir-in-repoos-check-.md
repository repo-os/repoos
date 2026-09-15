---
id: "0350"
title: Honor workDir/inputsDir in repoos check's task-assets guard
type: bug
status: inbox
priority: p2
area: cli
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-15T09:22:35Z"
updated_at: "2026-09-15T09:22:35Z"
---
## Problem

Found in the #0348 audit of `repoos check` steps
(`docs/audits/2026-09-check-step-genericity-audit.md`, section 4). This doc
lands on `main` when #0348 closes out.

The `task-assets` guard in `src/commands/check.ts` is supposed to fail the
check when a binary is committed under the task or input folders. It runs
`git ls-files -- work inputs` with those paths hardcoded, and
`taskAssetOffenders()` matches the literal prefixes `work/` and `inputs/`.
`repoos.toml` already lets a project rename those folders (`workDir`,
`inputsDir`), but this guard ignores that. A managed repo that keeps tasks in
`tasks/` gets no protection at all.

## Direction

Pass `workDir` and `inputsDir` from `loadConfig()` into both the
`git ls-files` pathspec and the prefix match in `taskAssetOffenders()`. This
should be a small, self-contained change.

## Acceptance criteria

- [ ] With `workDir = "tasks"`, a tracked image under `tasks/.attachments/`
      fails the guard.
- [ ] The default `work`/`inputs` layout behaves exactly as it does today.
- [ ] Unit tests for `taskAssetOffenders()` cover a custom directory.
- [ ] `repoos check` passes.

## Related

- #0348, where the audit found this

## Activity

- 2026-09-15T09:22:35Z · created · unknown
