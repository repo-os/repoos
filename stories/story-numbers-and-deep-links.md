---
name: Story numbers and deep links
created_at: "2026-09-24T15:46:29.566Z"
created_by: hello@repoos.org
---
# Story numbers and deep links

Stories are now a first-class area of RepoOS (opt-in Stories page, PM-assisted
New story flow), but they are the one object type you cannot point someone at.
Tasks and inputs both have stable numeric IDs, deep links, and a clickable
number badge that copies or shares the direct URL. This story brings stories up
to that bar and tags the existing story work under one banner.

## Scope

1. **Stable numeric IDs for stories.** Every story definition gets a number,
   assigned the same way task and input numbers are, persisted in the story's
   record, and stable across renames, edits, and status changes. Existing
   stories (including this one) get numbers assigned on first load — a small
   one-time migration, not a renumbering of anything else.
2. **Deep links to stories.** A shareable URL that opens the story directly,
   using the same URL-param convention already used for tasks, inputs, and
   settings (`0345`, `0376`). Opening a story link on a board where the Stories
   page is disabled should land gracefully (visible page or a clear "stories
   are not enabled" state), never a blank route.
3. **Clickable number badge, same styling as tasks and inputs.** The story
   number renders with the exact badge treatment task and input numbers use
   (`0413`) — visible, recognizable as "the thing you click to get a link",
   click-to-copy with the same copied confirmation affordance. One shared
   component/style, not a third near-identical implementation.
4. **Tag existing story work to this story.** The Stories page (`0480`), its
   styling pass (`0485`), the PM-assisted New story flow (`0486`), and the New
   story panel styling standardization (`0496`) are grouped here so the story
   view shows the full arc of the feature, not just the newest increment.

## Outcomes

- Anyone can say "see story 12" in a chat, an MR description, or a task body
  and the number is a working permalink.
- Story numbers look and behave identical to task and input numbers — a user
  who has ever copied a task link already knows how to copy a story link.
- The Stories page shows each story's number alongside its name.

## Non-goals

- No changes to task or input numbering, link behavior, or routes — we are
  consuming that pattern, not revisiting it.
- No story slugs, vanity URLs, or name-based routing. Numbers only, for
  consistency and stability.
- No cross-linking model (story ↔ task backrefs, roll-up progress) beyond what
  the Stories page already does — that's a separate story if wanted.
- No renumbering or reordering of existing stories beyond the initial ID
  assignment.

## Open questions

- **URL shape.** Match the existing task/input deep-link param exactly rather
  than inventing a story-specific route — confirm the current convention when
  implementing and follow `0376`'s approach for the number → record lookup.
- **Where the badge shows.** Story header on the Stories page for sure; does
  the story definition surface anywhere else (task drawer, PM chat) where the
  number should also appear and be copyable?
- **Migration behavior for pre-existing stories.** Number assignment order for
  stories that already exist (creation order is the obvious choice — confirm
  there is a reliable created-at on story records).
- **Is `0496` a permanent resident here?** It's tagged because the New story
  panel is half its subject; if it lands as generic panel-polish it may sit
  better untagged. Easy to remove from the list later if so.
- **Story links when Stories is an opt-in feature (`0480`).** Deep links should
  presumably still resolve (or explain themselves) on repos with the feature
  off — decide the desired behavior before wiring the route.
