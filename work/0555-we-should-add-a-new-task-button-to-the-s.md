---
id: "0555"
title: Add a New task button to the Story panel Tasks tab that presets the story
type: feature
status: active
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-a-new-task-button-to-the-story-panel
cli_override: opencode
model_override: opencode-go/mimo-v2.6-flash
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-09-27T15:54:28Z"
updated_at: "2026-09-27T17:34:38Z"
---
## Problem

The Story panel's **Tasks** tab (`StoryPanel.vue`, the `tasks` tab) is a read-only window onto a story. It lists the story's tasks and, since #0556, sorts them — but there is no way to add one from there. The only two ways to get a task onto a story today are both create-then-tag:

- `repoos new "…" --story "Delivery slice"` on the CLI, or
- create the task in the UI, reopen it, and pick its story from the task drawer's Story dropdown (#0525).

Neither is reachable from the story you are looking at. So the loop is: open Stories → open the story → work out what's missing → go to `/work` → New task → create → reopen the new task → find the Story dropdown → pick the right name from a list of every story on the board.

And the New Task panel cannot help even if you wanted to: its form (`NewTaskForm` in `src/ui-app/src/stores/ui.ts`) is `{ title, body, type, priority, area, assignedTo }` — there is no `story` field at all.

The plumbing exists everywhere except the UI form. `POST /api/tasks` already reads `body.story` and passes it to `CreateTaskInput.story` (`src/server/routes/tasks.ts`), `createTask` normalizes it with `normalizeStoryName`, and `repoos new --story` is a supported flag. Only the client-side form and store are missing the field, so this is a UI-layer task with one small additive server change (below).

## Desired UX

### The button

- The Tasks tab gets a **New task** button in its toolbar, at the **top right** — the row that already holds the sort dropdown added in #0556, which sits at the left. Same `Button` + `variant="accent"` + `<span class="plus">+</span>` idiom as the Stories page header's **+ New story**, at `size="sm"` so it lines up with the 34px sort trigger.
- Exactly one "New task" button definition. The toolbar currently lives inside the `v-if="story && story.tasks.length"` branch, so the empty state has no toolbar at all: hoist the toolbar above that `v-if` so it always renders, keep the sort `Select` conditional on there being tasks to sort, and keep the existing "No related tasks" copy.
- The button is present whatever the story's state — including a story with zero tasks, which is the case that most needs it. Registered-but-empty and tag-only stories both get it.

### Opening the panel

- Clicking it **closes the Story panel and opens the existing New Task panel** — the `ui.isNew` mode of `TaskDrawer.vue`, the same `openNewTask()` call the Work page header and Dashboard make. No new dialog, no second creation form, no story-specific variant. Follow the hand-off `StoryPanel.openTask()` already uses: `emit("close")` first, then the store call, so the two surfaces never fight over focus.

### The story is set for you, visibly

- The New Task panel opens with the story already applied **and showing it**. A hidden prefilled value is not acceptable — the user cannot tell where the task is about to land.
- The control is the shared styled `Select` built from the existing `storyOptions` list (registered definitions plus names already used on tasks, deduped and sorted) and the same "none" sentinel (`STORY_NONE_SELECT`) the task drawer's Story control uses. The current story is preselected, and it can be changed or cleared like any other story.
- It sits in the mode-independent part of the panel, alongside the existing shared **Screenshots** field above the Freeform/Manual tab body — so it is present and correct in **both** modes and cannot drift between them. Do not add a second copy inside the Manual field grid.
- It is gated on the same `storiesEnabled` check the task drawer uses (`config.stories.enabled === true`), so nothing new appears in a repo with stories off.

### Both creation modes have to carry it

This is the part that is easy to miss: **Freeform is the default mode.** `newMode` defaults to `config.form.defaultTaskMode`, which falls back to `"freeform"`, so a user who arrives from a story and simply types a description hits `createFreeformTask` — and that path takes no `story` argument today, so the tag would be silently dropped for most users.

- Both submit paths read the same `ui.nt.story`:
  - **Manual**: `createTask()` in `TaskDrawer.vue` → `repo.createTask({ ...ui.nt })` — the tag rides along once `story` is on the form and on `createTask`'s parameter type.
  - **Freeform**: `createFreeformTask(explanation, runId, overrides, inputId)` gains a `story` argument, sent as `story` in the POST body, read and passed to `repoos.createTask` by the freeform route.
- Verify the tag survives the PM agent's flesh-out rewrite, which lands asynchronously after the draft is created. That rewrite is a body edit and `story` is frontmatter, so it should hold — but check it on a real freeform create, because a task that silently loses its story is the exact failure this task exists to prevent.

### Coming back to the story

- `createTask()` currently ends with `router.push("/work")`. Doing that after creating a task *from a story* throws the user off the story they were just working in and onto a board that knows nothing about stories.
- Decision: when the created task carries a story, return to that story — `/stories?story=<number>` for a numbered (registered) story, falling back to the story name for a tag-only one, which the existing `?story=` resolver (`findStoryByRef`) already accepts. Otherwise keep the current `/work` push. The Stories view honours `?story=` on arrival, so the user lands back where they started with the new task in the list.

## Acceptance criteria

- [ ] The Story panel's Tasks tab shows a **New task** button at the top right of its toolbar, using the shared `Button` component with the `+` affordance — no bare `<button>`, no unstyled control.
- [ ] Clicking it closes the Story panel and opens the existing New Task panel (`ui.openNewTask`). No new dialog or panel component is introduced.
- [ ] The New Task panel opens with the current story preselected in a **visible** Story control — the value is shown as text, not merely held in state.
- [ ] That control is the shared styled `Select` over the existing `storyOptions` list, offers a "none"/clear option, and renders only when `stories.enabled` is true.
- [ ] It renders in both Freeform and Manual modes from one shared position; there is exactly one Story control in the panel at any time.
- [ ] Creating in **Manual** mode writes `story:` into the new task's frontmatter, and the task shows up in that story's list, counts and progress immediately.
- [ ] Creating in **Freeform** mode (the default) also carries the story through, and the tag is still present after the PM agent's asynchronous flesh-out completes.
- [ ] The story name is whitespace-normalized consistently with the rest of the product (`normalizeStoryName`), so arriving from a story with a messy name cannot silently create a second, near-duplicate story.
- [ ] Clearing the Story control before submitting creates an untagged task and the story's counts do not change.
- [ ] After a successful create with a story set, the user lands back on that story (`/stories?story=…`) and sees the new task in its Tasks tab. A create with no story still lands on `/work` exactly as today.
- [ ] Opening New task from the Work page, the Dashboard, or `NeedsYouPanel` shows **no** story preselected — the prefill is scoped to the story hand-off, and `nt.story` is reset on open and after a successful create.
- [ ] The Stories page, the task drawer's own Story control, the story roll-up and the CLI are otherwise unchanged: `repoos new --story` and `repoos update --story` behave exactly as before.
- [ ] Tests cover the store layer (story sent on create in both modes, cleared on reset) and the panel's button (present in the Tasks tab, including the empty state). The UI smoke test still passes.
- [ ] New tests extend the existing suites in `src/ui-app/tests/` (`story-panel.test.ts`, `task-drawer-story-select.test.ts`) rather than introducing a new harness.

## Notes for AI

- Reuse what already exists rather than building parallel machinery: `openNewTask(assignedTo)` in `src/ui-app/src/stores/ui.ts` (add a second, optional `story` parameter so every existing call site stays untouched); `STORY_NONE_SELECT`, `storySelectValue`, `storySelectLabel`, `onStorySelectUpdate` and `storyOptions` in `TaskDrawer.vue`; `createTask` in `src/ui-app/src/stores/repo.ts`; `CreateTaskInput.story` in `src/core/repoos.ts`; and the route's existing `story: body.story as string | undefined` pass-through in `src/server/routes/tasks.ts`.
- `openNewTask` resets `nt` field by field, and `story` has to join that list — otherwise the next plain New task inherits the previous story. Keep the deliberate carve-outs intact: `pendingScreenshots` and the freeform draft survive close/reopen within a session (#0510). `story` is per-open context, not a draft.
- The New Task panel's Manual form is a *different* form from the task drawer's details form. Do not reuse the drawer's `draft` object or its `DRAFT_FIELDS` — the new-task form is `ui.nt`. Sharing the select *markup* is fine; sharing the state object is not.
- Repo conventions apply: the custom styled dropdown for the new control, shared and teleported styles in `src/ui-app/src/style.css` rather than a component `<style scoped>` block, and no `position: fixed` overlay outside a `<Teleport>` (AGENTS.md).
- Rebuild the UI after the change (`bun run build:ui`) so the worktree build is fresh. Do not start a server or request a preview as part of finishing.
- No new runtime dependency, no schema change, no `repoos.toml` setting. The one server edit (reading `story` on the freeform create) is purely additive: an absent `story` already means "untagged", so existing behaviour cannot change.

## Assumptions I made, since the request left them open

- **"Stories Tasks tab" is the Tasks tab inside the Story panel** (`StoryPanel.vue`), not the Stories page. It is the only Tasks tab in the product, and the only reading under which "from within a story" means anything.
- **"At the top right" is the Tasks tab's toolbar row**, to the right of the sort dropdown from #0556 — not the Stories *page* header, which has no story to preselect.
- The story is **preselected and editable**, not locked: the request says to set it automatically, not that the user may not change it.
- The prefill applies to **whichever mode the panel opens in**, including the default Freeform mode, because silently dropping the tag would make the feature look broken for most users. The narrower alternative — forcing Manual mode on arrival from a story — is rejected: it overrides the user's configured default and leaves Freeform permanently untagged.
- **Post-create navigation returns to the story** when one is set, replacing the unconditional `/work` push. If the reviewer would rather always land on `/work`, that is a one-line change in `createTask()` and nothing else in this spec depends on it.
- Story is exposed in the New Task panel **generally** (whenever `stories.enabled`), not only on the story hand-off. A field that appears in one entry point but not another reads as a bug the first time someone opens New task from `/work`.

## Scope

In scope:

- New task button and toolbar layout in the Story panel's Tasks tab
- A `story` field on the New Task form and store, threaded through both the Manual and Freeform create paths (including the one additive server change)
- The visible, editable Story control in the New Task panel
- Returning to the story after a create that carried one
- Test coverage for the above

Deferred:

- A `?story=…&task=new` deeplink that opens the prefilled panel directly
- A New task button on the story *cards* in the Stories page grid
- Creating a story and its first task in one step from an empty story
- Bulk or template task creation, and manual reordering within a story
- Any change to how stories are registered, numbered, deeplinked or rolled up

## Original prompt

We should add a "New Task" button to the Stories Tasks tab (at the top right). If a user creates a task from within a story then set the story name automatically on that task. Reuse the "New Task" panel, don't create a new one.

## Activity

- 2026-09-27T15:54:28Z · created · hello@repoos.org
- 2026-09-27T15:57:29Z · note: Freeform PM run failed: the opencode agent timed out after 180s
- 2026-09-27T17:28:41Z · title, area, body
- 2026-09-27T17:28:47Z · status draft→inbox
- 2026-09-27T17:32:54Z · cli_override, model_override
- 2026-09-27T17:32:57Z · model_override
- 2026-09-27T17:34:25Z · status inbox→ready
- 2026-09-27T17:34:35Z · review_cli_override, review_model_override
- 2026-09-27T17:34:37Z · review_model_override
- 2026-09-27T17:34:38Z · status ready→active, branch
