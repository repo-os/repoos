---
updated_at: "2026-09-27T16:06:29Z"
review_passes: 1
id: "0553"
title: Add a go-to-story link arrow on tasks and make sure every story has a unique number
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-a-go-to-story-link-arrow-on-tasks-an
created_at: "2026-09-27T15:06:45Z"
last_check_failure: "[object Object]"
---
## Problem

A task that belongs to a story only tells you so with plain text: the drawer's
Story field shows the story *name* inside a select, and there is no way to act
on it. Answering "what else is in this story?" from a task means remembering the
name, navigating to `/stories` by hand, and finding the right row — or having a
deep link you don't. Stories are the one object type you cannot click through
to from the thing that references them, even though they now have stable
numbers and working deep links (story #0002 / #0515).

The link target only holds up if every story has a number to be linked by. The
boot-time backfill in `ensureStoryNumbers` numbers story *definition files* that
lack a `number:`, and it skips numbers already in use — but a hand-edited or
copy-pasted `number:` in a story file is trusted as-is, so two stories can end
up sharing `#0001` and the deep link becomes ambiguous. And a story that exists
only as a task tag (no `stories/*.md` file) has no number at all, so it has
nothing stable to link by.

## Desired UX

- In the task drawer's **Details** tab, the Story field gets a small icon-only
  link/arrow button next to the story name, shown whenever the task has a story
  assigned.
- Clicking it closes the drawer and opens that story's side panel on the Stories
  page — the panel itself, not just the story list — landing on the story's story
  tab so the user immediately sees the story body and its tasks.
- The button carries a tooltip and accessible name that says where it goes, e.g.
  `Open story "Story numbers and deep links" (#0002)`.
- The button is absent when the task has no story, and the whole Story control
  (field *and* button) stays hidden when `[stories] enabled = false`, matching
  the existing `storiesEnabled` gate — no dead control.
- A story tagged onto a task but never written to `stories/*.md` still gets a
  working button, linking by story key (there is no number to link by).
- The number badge on the Stories list/panel is unchanged — this is a second,
  navigational affordance, not a replacement for copy-to-clipboard.

## Acceptance criteria

- [ ] A task with a story assigned shows a link-arrow button beside the Story
      field in the drawer's Details tab; clicking it navigates to
      `/stories?story=<number>` and the story panel opens with that story shown
      (story tab, not a remembered tab from a previously opened story).
- [ ] The task drawer is not left open on top of / behind the story panel after
      the click; unsaved edits in the drawer are handled the same way the
      drawer's existing close-and-navigate affordances handle them.
- [ ] The button has an accessible name and tooltip naming the target story
      (including its number when it has one).
- [ ] No button renders when the task has no story, and no button renders at all
      when `[stories] enabled = false` — matching the existing `storiesEnabled`
      gate on the Story field.
- [ ] A task tagged to a tag-only story (no definition file, so no number) still
      gets a working button via the story key; no error toast, no blank route.
- [ ] A story definition file with no `number:` is assigned one on load, and the
      assigned number is not already used by another story.
- [ ] Numbers are unique across all stories: if two story files somehow carry the
      same `number:` (hand-edited or copy-pasted frontmatter), the collision is
      resolved so each story keeps a distinct number, and no two stories render
      the same `#0001` badge or resolve to the same deep link.
- [ ] Assignment is idempotent and non-destructive: a story that already has a
      number keeps it across restarts, renames, and edits; deleting a story and
      creating another does not hand a live story a duplicate.
- [ ] Tests cover: the button's render/hide conditions and the `?story=` value it
      produces (including the tag-only key case), plus the number backfill
      assigning a number to a numberless legacy story and keeping every number
      unique — including the seeded-duplicate and delete-then-create cases.
- [ ] `bun run fmt` run before committing on the task branch, then `repoos check`
      passes.

## Notes for AI

- Reuse the existing deep-link convention. `StoriesView.vue`'s `findStoryByRef`
  already resolves `?story=` from `#7`, `7`, `0007`, or the story key — build the
  link in that shape and let the existing watcher open the panel. Do not add a
  route, a new query param, or a second resolver.
- Do not build a second numbering path. `ensureStoryNumbers`
  (`src/core/story-definition-files.ts`, called from `src/server/server.ts` at
  boot) already assigns numbers to definition files, skips numbers in use, and
  never renumbers. Extend/verify it and its tests
  (`src/ui-app/tests/story-numbering.test.ts`) for the collision case; do not
  hand-edit any file under `stories/`.
- Story files are `stories/*.md` and are only ever written through the story
  definition helpers (or the New story flow) — same rule as `work/*.md`: no
  direct file writes outside the API/helpers.
- Assumption: the button lives in the task drawer's Details tab, in the same
  `field` as the Story select. That is the only place a task's story is shown
  today (`TaskCard.vue` renders no story), and it matches the screenshot
  attached to this task — confirm against `work/.attachments/0553/` before
  building. Do not add a story row to task cards.
- Assumption: the button navigates rather than toggling, i.e. it leaves the
  drawer and opens the story panel on `/stories`. The user's stated goal is
  "go to the story panel", not "peek without losing the task".
- Style it like the rest of the app: an icon-only control using the shared
  button/field classes in `src/ui-app/src/style.css` and the existing icon
  treatment (the story chevron in `StoriesView.vue` is a reasonable reference) —
  no bare `<button>` with bespoke colors in a `<style scoped>` block, and no
  default `<select>` introduced anywhere.
- If the story name no longer resolves (a rename drifted the tag), don't leave
  the user on a blank route — fall back to the Stories list.
- Out of bounds: task/input numbering, `CopyableNumber` badge behaviour, the
  story deep-link URL shape, and the roll-up/progress model (an explicit
  non-goal in story #0002).

## Scope

In scope: the go-to-story link button on tasks; story-number completeness and
uniqueness (including resolving a pre-existing duplicate); the tag-only-story
link fallback.

Deferred: showing a task's story on the board card; a "sibling tasks in this
story" strip inside the drawer; any renumbering of existing stories; story ↔
task roll-up progress.

## Related

- `stories/story-numbers-and-deep-links.md` (story #0002) — the story that made
  stories numbered and deep-linkable; this task is its follow-through.
- #0515 — Stories should have numbers and deeplinks just like tasks and inputs
  (the `ensureStoryNumbers` backfill and the copyable badge this builds on).
- #0502 — the story side panel this button opens; #0480 — the Stories page.

## Original prompt

When a task is assigned to a story let's add a link arrow button for the user to click to easily go to that story (all stories have numbers and deep links now). As part of this, if any legacy stories don't have story numbers please just give them one (but make sure each story has a unique number, so don't have two stories with #001 etc). For example on this task in the screenshot I am curious what other tasks are in the story, so I wanted an easy way to click and go to the story panel.

## Screenshots

![Screenshot-2026-09-27-at-23.06.03](/api/tasks/0553/attachments/screenshot-1.png)

## Activity

- 2026-09-27T15:06:45Z · created · hello@repoos.org
- 2026-09-27T15:06:46Z · screenshots
- 2026-09-27T15:08:52Z · status draft→inbox, title, area, body
- 2026-09-27T15:11:03Z · status inbox→ready
- 2026-09-27T15:11:08Z · status ready→active, branch
- 2026-09-27T15:45:54Z · handoff failed · remote validation failed: remote validation failed (exit 1) — [validate] cloning bundle /Users/peckjachowski/.repoos-0553-abf399bf.bundle
Note: switching to '1360693c831d5b04bdb97b02efda97a626ea3959'.
You are in 'detached HEAD' state. You can look around, make experimental
changes and commit them, and you can discard any commits you make in this
state without impacting any branches by switching back to a branch.
If you want to create a new branch to retain commits you create, you may
do so (now or later) by using -c with the switch command. Example:
  git switch -c <new-branch-name>
Or undo this operation with:
  git switch -
Turn off this advice by setting config variable advice.detachedHead to false
[validate] HEAD verified at 1360693c831d5b04bdb97b02efda97a626ea3959
failed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running: dial unix /var/run/docker.sock: connect: no such file or directory
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-09-27T16:01:46Z · status active→review

