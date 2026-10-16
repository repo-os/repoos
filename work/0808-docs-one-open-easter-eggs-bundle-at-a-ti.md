---
id: "0808"
title: "Docs: one open easter-eggs bundle at a time, areas may mix"
type: chore
status: active
priority: p3
area: docs
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/docs-one-open-easter-eggs-bundle-at-a-ti
created_at: "2026-10-16T10:04:51Z"
updated_at: "2026-10-16T10:25:45Z"
---
## Problem
The easter-eggs rules were unclear, so several bundles were filed separately: #0805 and #0806 were both open at once. The user wants a single open bundle at a time, so small tweaks get grouped instead of spread across tasks.

Current docs (docs/easter-eggs-bundles.md, the 'One area family' rule and 'Rules of thumb') and AGENTS.md ('Small fixes: bundle them as easter eggs') don't say this, and the area rule would split a mixed set of small web and server items.

## Desired UX
- Add to AGENTS.md and docs/easter-eggs-bundles.md: there is only ONE open easter-eggs bundle at a time. A new small fix is added to the open bundle (update its body and items), not filed as a new task. Start a new bundle only after the open one has landed.
- Replace the 'One area family' rule: a bundle may mix areas (web, server, docs) when every item is small and independent. Each item still commits separately. Keep the 3 to 6 item guide, and say that an open bundle that is already large is split instead of grown.
- Say how to add an item: update the bundle body, add the item's source task, its one-line fix and its test, and mark the source task superseded when the bundle lands.
- Say how to mark a task superseded without using 'repoos mv <id> done'. Use an explicit note in the task body, and leave the status as it is.

## Acceptance criteria
- AGENTS.md has the one-open-bundle rule in its 'Small fixes' bullet, in plain words.
- docs/easter-eggs-bundles.md has the same rule, the mixed-area rule, the add-an-item steps and the superseded note.
- No task file is edited by hand; changes go through this task's branch.

## Notes for AI
Edit AGENTS.md and docs/easter-eggs-bundles.md on this task's branch. Do not commit to main. The existing open bundle is #0805 (Copilot event lines, Set editor hints), which absorbed #0806. Source: user request 2026-10-16.

## Activity

- 2026-10-16T10:04:51Z · created · njachowski@gmail.com
- 2026-10-16T10:25:34Z · status inbox→ready
- 2026-10-16T10:25:45Z · status ready→active, branch
