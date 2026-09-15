---
id: "0350"
title: Honor workDir/inputsDir in repoos check's task-assets guard
type: bug
status: done
priority: p2
area: cli
assigned_to: ai
created_by: ""
branch: feat/honor-workdir-inputsdir-in-repoos-check-
model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-09-15T09:22:35Z"
updated_at: "2026-09-15T15:53:38Z"
review_passes: 3
review_rounds: 1
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
- 2026-09-15T14:22:16Z · model_override
- 2026-09-15T14:22:19Z · status inbox→ready
- 2026-09-15T14:22:20Z · status ready→active, branch
- 2026-09-15T14:28:59Z · status active→review
- 2026-09-15T15:11:51Z · note: Addressed the review's normalize-leading-./-and-fail-loud suggestion (commit 508b3b27 on this branch, repoos check green): added normalizeGuardDir() (strips leading ./, treats '.' as empty) used in taskAssetOffenders' prefix building, plus a yellow warning at the check.ts call site when a configured workDir/inputsDir normalizes to nothing. Also found and fixed a related issue while implementing this: an empty-string workDir previously made git ls-files exit fatally, which the surrounding try/catch silently swallowed as 'not a git repo', turning a misconfiguration into a false pass — the new warning now catches this before that call even runs. Tests added for both normalizeGuardDir and the ./ / empty-dir cases in taskAssetOffenders.
- 2026-09-15T15:34:11Z · status review→active
- 2026-09-15T15:37:55Z · status active→review
- 2026-09-15T15:53:38Z · status review→done, release:success
