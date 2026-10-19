---
id: "0847"
title: "Easter eggs bundle: hide the \"0 changes\" chip on task cards"
type: chore
status: inbox
priority: p3
area: web
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-19T07:50:02Z"
updated_at: "2026-10-19T07:50:02Z"
---
## Items

- [ ] **E1 · No "0 changes" chip on task cards** (web) — show the file-count chip only when a task has file or code changes; show nothing at zero. Source: Nick 2026-10-19, screenshot of #0794's card.

Add further small, independent web fixes here with `repoos bundle add <id> ...` (one open bundle at a time).

## E1 · No "0 changes" chip on task cards

### Problem
A card for a task that has a branch but no changes yet shows a "0 changes" chip (screenshot: #0794, a human-only chore in Ready). It adds visual noise on exactly the cards that have nothing to say, and it carries a native `title="No code changes"` tooltip, which AGENTS.md forbids for new UI. The chip is the `v-else-if="diffStats && diffStats.filesChanged === 0 && task.branch"` span in `src/ui-app/src/components/TaskCard.vue` (~line 1127).

### Desired UX
- When a task has no file or code changes yet, the card shows **no** changes chip at all (no "0 changes", no empty placeholder, no reserved space that shifts the layout).
- When it has changes, the existing file-count chip (`FileText` icon + number, tooltip with files and +/- lines) is unchanged.
- Cards in every column (Ready, Active, Review, Done) and both themes behave the same; the row collapses cleanly when the chip is the only thing in it.

### Acceptance criteria
- Test: a card for a task with a branch and `filesChanged === 0` renders no changes chip and no "0 changes" text.
- Test: a card with `filesChanged > 0` still renders the file-count chip with its tooltip.
- Test: while diff stats are still loading (undefined) nothing flickers in.
- Declared shot of a board with a Ready human task that has a branch and no changes (use a real task id and an existing fixture, or add a `card:noChanges` fixture), light and dark; open the PNG to confirm no chip and no empty gap.
- Remove the now-unused `.diff-stats-empty` styles if nothing else uses them.

### Notes for AI
Smallest possible change: delete the `v-else-if` "0 changes" span and its CSS. Do not touch the `filesChanged > 0` chip. Never touch repoos.toml.

## Problem
See E1: the card shows a "0 changes" chip when there is nothing to show.

## Desired UX
No changes chip at all until a task has file or code changes (see E1).

## Acceptance criteria
See E1 (and the E-sections of any items added later); all items must hold.

## Notes for AI
Items are independent; edit them with `repoos bundle edit`, never a full `--body`. Never touch repoos.toml.

## Activity

- 2026-10-19T07:50:02Z · created · njachowski@gmail.com
