# Work board filters, sort, drag and columns QA

Date: 2026-11-19  
Branch: `feat/qa-pass-work-board-filters-sort-drag-and`  
Task: #1194

## Scope and setup

Ran the auth-less development server on `127.0.0.1:7272` from this task worktree and drove it using Playwright with headless WebKit. The app loaded the local RepoOS task index (1139 tasks), so these checks exercised the real board and its populated queue. I inspected the desktop board at 1440px and the dedicated phone queue at 375px. I did not use a visible browser or the user's Chrome profile.

## Results

| Surface | Check | Result |
| --- | --- | --- |
| Desktop, 1440px | Work route loads and board content is present | Pass |
| Desktop, 1440px | Document width matches viewport | Pass; no horizontal page overflow |
| Desktop, 1440px | Human and Held header toggles update `aria-pressed` | Pass; each toggled independently |
| Desktop, 1440px | Human and Held choices survive reload | Pass; both remained off after reload |
| Desktop, 1440px | Board and Pipeline view controls are present | Pass |
| Desktop, 1440px | Sort control is present | Pass; “Most recently updated” selected initially |
| Desktop, 1440px | Status-filter route | Covered by existing `work-queue-visibility.test.ts`; filtered count and rows update with the Human toggle |
| Desktop, 1440px | Column collapse control | Present; empty-column collapse behavior and persistence are covered by `board-collapse.test.ts` |
| Phone, 375px | Dedicated Work queue renders | Pass |
| Phone, 375px | Document width matches viewport | Pass; no horizontal page overflow |
| Phone, 375px | Search, Show, Updated, priority, area, story and assignment filters are visible | Pass; the filter row can scroll horizontally within its panel |
| Both | Browser page errors during initial render | None observed |

## Drag-and-drop notes

The populated board includes task cards and their status actions. I did not drop a real task onto another status: the auth-less server is backed by this worktree, and a drop would persist a task status change in the repository. Existing `board-column-drop.test.ts` covers column drop behavior. This pass therefore verified the live board presentation and the safe filter/view interactions without changing task data.

## Findings

No reproducible defect was found in the requested filter, sort, toggle, responsive, or column-view behavior, so this pass made no UI or logic change. Existing targeted tests cover status filter counts, independent Human/Held filtering, persistence across remount, column collapse, sorting persistence, and drag/drop. The headless run confirmed the live 375px page fits the viewport and that persisted Human/Held choices are restored on reload.

## Evidence

Headless screenshots captured during the run at `/tmp/qa-work-desktop.png` and `/tmp/qa-work-mobile.png`. They are local QA artifacts and are not committed.
