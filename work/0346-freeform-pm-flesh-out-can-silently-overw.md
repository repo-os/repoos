---
id: "0346"
title: Freeform PM flesh-out can silently overwrite/lose a task's original prompt
type: bug
status: active
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: fix/0346-freeform-draft-corruption
created_at: "2026-09-14T06:53:49Z"
updated_at: "2026-09-14T06:55:53Z"
---
## Problem

Task #0345's freeform ("New task") creation lost the user's original prompt
and produced a garbage title/body. Root cause, traced from the actual
committed history of `work/0345-...md`:

1. The draft-first design (#0251) worked correctly — the raw prompt was saved
   under `## Original prompt` immediately, before any AI touched it.
2. The PM agent's flesh-out pass then replied with a plain status message
   ("Done. Wrote the structured task body into `work/0345-...md`. Key
   decisions captured...") instead of the requested frontmatter+body file
   content.
3. `parseGeneratedTask` (`src/server/freeform.ts`) has a fallback for
   unparsable output: when no `---` frontmatter is found, it treats the
   *entire raw reply* as the new body and derives a title from its first
   line. That fallback exists so a bad reply doesn't crash — but nothing
   downstream distinguished "fallback used" from "real content", so the
   PM's stray prose got written as if it were the real spec
   (`src/server/routes/tasks.ts`, the `parseGeneratedTask(output)` call).
4. Separately, `patchTaskFile`'s `PROTECTED_SECTIONS` mechanism
   (`src/server/write.ts`), which exists specifically to stop a body
   rewrite from dropping `## Original prompt` / `## Screenshots` /
   `## Activity`, offered no way for a caller to *correct* a
   Original Prompt section after the fact — any caller-supplied section
   with that heading was silently discarded in favor of the (possibly
   already-wrong or missing) on-disk copy. This blocked even a supported
   `repoos update --body` from restoring lost content.

## Status

Both of these were already fixed and verified in this session, on branch
`fix/0346-freeform-draft-corruption` (see below) — this task exists to give
that fix a durable record per AGENTS.md ("work that still needs doing — a
task, via `repoos new`", and durable findings belong in the repo, not a
chat transcript).

## What was fixed

- `src/server/freeform.ts`: `parseGeneratedTask` now returns
  `hadFrontmatter: boolean` on `GeneratedTaskInput`, so a reply with no
  frontmatter block is distinguishable from real generated content instead
  of silently doubling as both.
- `src/server/routes/tasks.ts`: the freeform creation handler now treats
  `hadFrontmatter: false` the same as "the PM agent returned no usable
  output" — the draft (with its original prompt intact) is kept untouched
  and `task.aiCreateFailed` fires, instead of overwriting the draft with
  the agent's stray prose.
- `src/server/write.ts`: `patchTaskFile`'s protected-section handling now
  lets a caller's own `## Original prompt` section win over the on-disk
  copy when the caller's patch body explicitly includes one (e.g. a hotfix
  restoring lost content via `repoos update --body`). `## Screenshots` and
  `## Activity` remain force-preserved-from-disk regardless, since those
  are system-managed and must never be settable by a plain body replacement.
- `src/ui-app/src/components/TaskDrawer.vue`: the "New task" acknowledgment
  panel ("Creating your task...") previously never navigated anywhere once
  the PM agent finished — a user who stayed on that panel had no way to
  know the task was ready short of manually going to the board. It now
  watches `task.pmFinished` (already emitted server-side on every exit
  path) and, only if the user is still sitting on that panel with the
  New-task drawer open, opens the finished task automatically.
- Tests added: `src/ui-app/tests/freeform.test.ts` (hadFrontmatter cases,
  including the literal #0345 status-message reply) and
  `src/ui-app/tests/task-protected-sections.test.ts` (caller-supplied
  Original Prompt override, while Screenshots/Activity stay protected).
- Full `bun run test` (1507 tests) passes; `bun run build` is clean.

## Acceptance criteria

- [x] A PM agent reply without frontmatter never overwrites a draft's title/body.
- [x] `repoos update --body` can restore/correct a task's `## Original prompt`
      section without needing to hand-edit the file.
- [x] `## Screenshots` / `## Activity` still can't be overwritten by a body patch.
- [x] The "New task" panel opens the finished task if the user is still on it
      when the PM agent finishes.
- [x] Existing task #0345 itself is restored (done directly as a hotfix,
      using `repoos update`, once the write.ts fix above unblocked it).

## Notes for AI

- Branch: `fix/0346-freeform-draft-corruption`.
- This was implemented directly in an interactive session (not a
  RepoOS task-runner agent), per AGENTS.md's "Interactive / external agent
  sessions" carve-out — the code is already written and tested; what
  remains is `repoos check` and human review/merge sign-off.
- Do not re-diagnose from scratch — the root cause trace above is verified
  against the actual git history of `work/0345-...md`, not speculation.

## Related

- #0345 (the task whose creation triggered this)
- #0251 (draft-first freeform creation design)
- #0317 (original PROTECTED_SECTIONS mechanism)
- #0335 (PM-is-working live indicator / `task.pmFinished`)

## Activity

- 2026-09-14T06:53:49Z · created · unknown
- 2026-09-14T06:53:54Z · status inbox→active
- 2026-09-14T06:53:54Z · note: Implementing directly in an interactive session; code changes already made in the working tree, moving them onto this task's branch now.
- 2026-09-14T06:54:08Z · branch
- 2026-09-14T06:55:52Z · status active→review
- 2026-09-14T06:55:52Z · note: repoos check passes (build, tests 1507/1507, UI smoke test). Ready for review — see task body for the fix summary. Worktree left open on branch fix/0346-freeform-draft-corruption; not merged.
- 2026-09-14T06:55:53Z · status review→active
