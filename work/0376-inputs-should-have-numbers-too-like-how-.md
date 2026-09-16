---
updated_at: "2026-09-16T17:07:08Z"
review_passes: 1
id: "0376"
title: Add stable numeric IDs to inputs with deep links
type: feature
status: review
priority: p2
area: core
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-stable-numeric-ids-to-inputs-with-de
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-09-16T08:35:46Z"
---
## Problem

Inputs currently have no stable identifier. When someone wants to refer to a
specific input — in a task, a conversation, or a doc — there's no concise
handle to use. Tasks already have numbers (`#0001` style); inputs don't, which
makes the two core artifact types inconsistent and inputs awkward to talk
about.

## Desired UX

- Every input has a number, displayed alongside it in the UI (e.g. "Input #0001"),
  matching the way task numbers are shown.
- Numbers are stable: retroactively assigned to existing inputs and never
  reused or renumbered afterward.
- Inputs are deep-linkable via URL, e.g. `/inputs?input=0001` opens the board
  focused on that input.
- New inputs automatically get the next number, same pattern as tasks.

## Acceptance criteria

- [ ] Inputs carry a stable numeric ID, assigned retroactively to every input that exists at migration time.
- [ ] Existing inputs are migrated in-place with numbers that persist across restarts (no reassignment).
- [ ] New inputs are assigned the next number automatically, following the same scheme as task numbering.
- [ ] The inputs UI displays the number with each input (e.g. "Input #0001").
- [ ] `/inputs?input=0001` selects/highlights or focuses input 0001 when loaded.
- [ ] Numbering persists in the input's markdown/frontmatter like task ids do.

## Notes for AI

- Follow the existing task-numbering implementation as the pattern — reuse its
  approach (likely `src/core` for id assignment/migration and the inputs view
  under `src/ui-app/src/views/` for display + URL param handling).
- Migration of existing inputs must be idempotent and written up front, since
  it touches this repo's own data (same self-modifying caution as the task
  format — see AGENTS.md).
- Assumption: IDs are zero-padded 4-digit strings matching the task scheme
  (`0001`), not plain integers, so URLs and display stay consistent.
- Assumption: an unknown `?input=` param value should degrade gracefully (no
  crash; just no selection).
- Do not renumber on delete; deleted numbers stay retired.
- All input manipulation must go through `repoos` commands / HTTP API — never
  hand-write `inputs/*.md` files.

## Scope

Covers: input numbering, retroactive migration, UI display, and the
`/inputs?input=NNNN` deep link. Deferred: anything beyond plain
selection/focus of the linked input (no new input-editing or cross-linking
features implied).

## Related

- Task numbering scheme (existing) — reuse its format and assignment logic.
</arg_value></tool_call>

## Original prompt

Inputs should have numbers too (like how tasks have numbers), so that it's easy to refer to an input like "Input #0001". Let's retroactively give every existing input a number too. That way we can also create url's to inputs like: `/inputs?input=0001`

## Activity

- 2026-09-16T08:35:46Z · created · hello@repoos.org
- 2026-09-16T08:36:18Z · status draft→inbox, title, area, body
- 2026-09-16T09:03:28Z · status inbox→ready
- 2026-09-16T09:03:34Z · status ready→active, branch
- 2026-09-16T16:48:03Z · model_override
- 2026-09-16T17:00:15Z · status active→review

