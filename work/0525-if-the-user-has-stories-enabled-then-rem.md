---
id: "0525"
title: Replace Assigned to with a styled story dropdown in the task panel
type: feature
status: done
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/replace-assigned-to-with-a-styled-story-
created_at: "2026-09-27T00:58:01Z"
updated_at: "2026-09-27T02:43:05Z"
---
## Problem

The task drawer's top details form spends a top-level slot on an **Assigned to**
text field that is almost always `ai` once AI is set up — noise occupying the
most prominent row of the panel — while **Story**, the field the user actually
wants to reach for, is pushed onto its own row underneath it.

The Story control is also the odd one out visually: it is a datalist-backed
`<Input>` (`et-story` + `<datalist id="story-options">`), so it looks nothing
like the other dropdowns in the same form (Type, Priority, and the Status
control in the quickbar), all of which use the shared styled `Select` component.
Native datalist popups are unstyled and don't match the design system.

## Desired UX

- With stories enabled (`stories.enabled = true`), the top row of the details
form is **Area + Story**. "Assigned to" is no longer shown anywhere in that
section, and there is no longer a separate Story row below it.
- Story renders as a real dropdown built from the shared `Select` components —
the same markup shape as the Priority control beside it — so it looks and
behaves like every other dropdown in the panel. The trigger shows the task's
current story name, or a "no story" state when the task has no `story:` value.
- The options are the existing `storyOptions` list: registered story definitions
under `stories/` plus story names already used on tasks, deduped and sorted.
Picking one saves the task's `story`; picking the "none" option clears it,
which removes the task from that story's counts and progress.
- Nothing about the stored assignee changes. Task files keep `assigned_to: ai`,
and it stays writable from the CLI (`repoos update <id> --assigned-to ai|human`)
and via the default-assignee setting — just not surfaced in this panel.
- With stories disabled, the panel is unchanged from today: the Area + Assigned
to row, and no Story control at all.

## Acceptance criteria

- [ ] With `stories.enabled = true`, the details form shows no "Assigned to"
    field, and the story control sits inside the same `field-row` as Area
    rather than in a row of its own.
- [ ] The story control uses the shared dropdown components
    (`Select` / `SelectTrigger` / `SelectValue` / `SelectContent` /
    `SelectViewport` / `SelectItem`) with the same classes as the adjacent
    Priority control. No `<datalist>`, no plain `<Input list=...>`.
- [ ] The dropdown lists exactly `storyOptions` (registered definitions +
    names already used on tasks, deduped, sorted), and the trigger displays
    the task's current story name.
- [ ] If the task's current story is not in that list (set via CLI, or
    registered after the list was built), the trigger still shows it instead
    of rendering blank.
- [ ] A "no story" / none option clears the task's story, and the task
    immediately leaves the story's counts and progress.
- [ ] Saving after a story change PATCHes only `story`; a task with
    `assigned_to: ai` on disk still has `assigned_to: ai` on disk afterwards.
- [ ] The drawer's dirty tracking is unaffected: the hidden `assignedTo` never
    registers as a change, and the stored value survives unrelated saves.
- [ ] With `stories.enabled = false`, the panel is identical to today (Area +
    Assigned to row, no Story control).
- [ ] A UI test mounts `TaskDrawer` with stories enabled and asserts: no
    "Assigned to" label in the details form, the story dropdown renders in the
    same `field-row` as Area, and its options are dropdown items rather than
    datalist entries.

## Notes for AI

- Main file: `src/ui-app/src/components/TaskDrawer.vue`. The pieces are the
`storiesEnabled` computed (~line 240), the `storyOptions` computed (~line 245),
the details form's `field-row` holding `et-area` + `et-assignee` (~line 3459),
and the separate `v-if="storiesEnabled"` story field below it (~line 3479).
- Build the dropdown the way the neighbouring Priority block is built: `Select`
with `:model-value` + `@update:model-value` (or `v-model`), `SelectTrigger` /
`SelectValue`, `SelectContent position="popper"`, and a `SelectViewport`
carrying `h-[var(--radix-select-trigger-height)] w-full
min-w-[var(--radix-select-trigger-width)]`, then one `SelectItem` per story.
Custom styled dropdown component only — never a bare `<select>`
(AGENTS.md convention).
- Radix's `Select` reserves the empty string for its placeholder, so the
"clear the story" option needs a non-empty sentinel (e.g. `__none__`) that the
update handler maps back to `""`. The server clears `story` on an empty value
via `normalizeStoryName` (`src/server/write.ts`).
- Leave `assignedTo` in `TaskDraft`, `DRAFT_FIELDS` and `initDraft`. The field is
hidden, not deleted: the PATCH body is built from `changedFields()`, so an
untouched `assignedTo` is never sent and the stored value is preserved. Do not
strip `assigned_to` from task files and do not migrate existing tasks.
- Don't add free-text story entry to this dropdown. Stories are registered from
the Stories page (or a file under `stories/`), and `repoos new` /
`repoos update <id> --story` cover naming one from the CLI. An editable
combobox would be a separate follow-up.
- Assumption: "the task panel top section" is the task drawer's details/edit
form — the one that has the Story field. The New task drawer's own form (its
`nt-*` fields, including its "Assign to" select) is a different panel; leave
it alone.
- Assumption: removing "Assigned to" is scoped to the stories-enabled case,
because that is the only case where the story selector replaces it. With
stories off, the field stays. If the user wants it gone unconditionally that is
a one-condition change — say so rather than doing both.
- Docs: `user-docs/configuration.md` describes "the task drawer's Story field" and
the `--assigned-to` flag in its Stories section. Update that copy if this
change makes it wrong. Don't go hunting for unrelated doc drift.
- No new `repoos.toml` key and no new Settings control — this reuses
`stories.enabled`, which already has one.
- Run `bun run fmt` before committing on the branch (the commit hook skips task
branches), then `repoos check` before handing off.

## Scope

Covers: the task drawer's details form — dropping the "Assigned to" field and
promoting the story control into the top row with standard dropdown styling.

Deferred: surfacing `assigned_to` again (e.g. a future human board view — the
field stays in frontmatter and CLI-writable); free-text / combobox story entry;
the New task drawer's "Assign to" select; any change to the Stories page or to
story storage and normalization.

## Related

- `user-docs/configuration.md` — Stories section (`stories.enabled`, the
drawer's Story field, `--assigned-to`)
- #0486 — New story flow with PM-assisted story definitions
- #0502 — Side panel with tabs for stories
- #0515 — Stories should have numbers and deeplinks just like tasks
- #0005 — Make default "Assign To" set to AI (why the field is near-constant)

## Original prompt

If the user has stories enabled, then remove "assigned to" in the task panel top section (which is generally always AI if the user has AI setup) and instead place the story selector there rather than on it's own line. In the task files you can still keep "assigned to: ai" but don't need to show it here anymore (because it's just noise for now...) but maybe in the future if we add a human board view we may want to use that field again. also for the story selector dropdown (or text entry?) please use the normal dropdown styling used for task status etc not whatever is currently.

## Screenshots

![Screenshot-2026-09-26-at-20.04.46](/api/tasks/0525/attachments/screenshot-1.png)

## Activity

- 2026-09-27T00:58:01Z · created · hello@repoos.org
- 2026-09-27T00:58:02Z · screenshots
- 2026-09-27T00:59:52Z · status draft→inbox, title, area, body
- 2026-09-27T01:03:51Z · status inbox→ready
- 2026-09-27T01:07:23Z · status ready→active, branch
- 2026-09-27T01:12:21Z · status active→review
- 2026-09-27T02:43:05Z · status review→done, release:success
