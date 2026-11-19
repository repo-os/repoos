# Task card states QA — 2026-11

## Scope and method

Checked the board's task card (`TaskCard.vue`) in every state the board can show, plus extreme content and missing fields. Each state is a fixture: the real component is mounted in jsdom, its markup is captured, and that markup is rendered in headless WebKit at 375, 768 and 1280 CSS pixels. No visible browser was opened and no focus was taken. The suite is `src/ui-app/tests/task-card-states-qa-browser.test.ts`: 11 fixtures × 3 widths = 33 card renders, plus per-state badge checks and two store and markup checks.

Two rules are checked on every render:

- **No spill.** The card is `overflow: hidden`, so a child that runs past the card edge is clipped silently. Every visible descendant must sit inside the card's box, and the card must sit inside the viewport.
- **No placeholder text.** A missing field must not print `undefined`, `null`, `NaN` or `[object Object]`.

Card widths are representative, not measured from a live board. The board shares the viewport between its columns, so the card gets 351 px on a phone (one full-width column), 336 px on a tablet (two columns) and 220 px on a laptop (five columns). The 220 px laptop width is the stress case.

## State results

| State | Fixture | 375 | 768 | 1280 | Notes |
| --- | --- | --- | --- | --- | --- |
| Baseline ready | short title, one area | Pass | Pass | Pass | Reference card. |
| Long title | ~190-character title, active | Pass | Pass | Pass | Title clamps to two lines; the card does not grow. |
| Unbroken title | one ~220-character token with no spaces | Pass | Pass | Pass | Breaks inside the card. |
| Many labels and blockers | ten areas, fourteen tags, four blockers, long type name | Pass | Pass | **Fixed** | At 1280 the long type name pushed the agent button and priority badge past the card edge. |
| Held | `isHeld`, long reason, future `holdUntil` | Pass | Pass | Pass | `Held` badge present. |
| Paused | engineer paused (`pausedIds`) | Pass | Pass | Pass | Stalled `paused` badge present. |
| Needs input | `cto-escalation` with a long detail | Pass | Pass | Pass | Detail clamps to three lines. |
| Human-assigned | long reviewer handle | Pass | Pass | **Fixed** | At 1280 the human chip ran to x=292 in a card whose right edge is x=232. |
| Review, needs merge | `needsMerge`, three areas | Pass | Pass | **Fixed** | At 1280 the header row overflowed; the `needs merge` badge now sits on its own row. |
| Missing fields | empty title, type, priority, area, branch, body and timestamps | Pass | Pass | Pass | No placeholder text leaks. |
| Archived | `isArchived` | n/a | n/a | n/a | Archived tasks never render as cards. The store parks them in `archivedTasks` and excludes them from every column; a jsdom test asserts this. |

Pass means the render had no spill, no off-viewport element and no placeholder text.

## Changes

1. **Header row wraps and the type chip truncates** (`src/ui-app/src/components/TaskCard.vue`). The header row (number, type, merge badge, hotfix badge, agent button, priority) could not wrap, so a long type or a merge badge pushed the right-hand group out of the card. The row now wraps, and the type chip truncates with a styled `data-tip` carrying the full name. The full name is not shown as a native `title`.
2. **Human chip shrinks and breaks long handles** (`src/ui-app/src/style.css`, `.tc-human-chip`). It had `flex: none`, so a long email never shrank. It now caps at the row width and breaks anywhere.
3. **Existing header test updated** (`src/ui-app/tests/task-card-agent-header.test.ts`). It located the header by its old `gap-[7px]` class. It now uses `flex-wrap` as the anchor.

Before the fixes, the new suite failed three of its 35 cases, all at 1280 px. After the fixes all 35 pass, and the related card and board suites (28 files, 243 tests) pass.

## Evidence

Full-page JPEGs for every fixture and width are in the ignored `.repoos/qa-evidence/1246/`. Spot checks: the many-labels card at 1280 truncates the type name and wraps its blocker chips; the needs-input card at 375 keeps its footer; the needs-merge card at 1280 wraps its header onto two rows.

## Limits

- **Board columns are not covered here.** The column header and its count were not given extreme labels in this pass. The existing board suites (`work-board-moves-qa-browser.test.ts`, `board-column-labels.test.ts`) cover the column behaviour they were written for.
- **Scoped child styles.** The WebKit page takes the global stylesheet and the scoped CSS of `CopyableNumber` only. Other child components' scoped styles are not loaded, so a child with its own scoped layout could render differently on a real board.
- **Card widths are assumed.** The widths in the table are representative, not measured from a live board, so the 1280 result is a stress case rather than a sized reproduction.
- **No real device.** Results come from headless WebKit only. Touch behaviour and real font metrics on iOS or Android are not verified.
- **Fixtures, not live data.** Every state is a fixture. No live server, agent or runner produced these cards.
