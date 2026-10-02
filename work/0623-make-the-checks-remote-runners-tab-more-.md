---
updated_at: "2026-10-02T03:54:27Z"
review_passes: 1
id: "0623"
title: Align Remote runners tab rows and document table-like row layout
type: feature
status: review
priority: p2
area: [web, agent]
assigned_to: ai
created_by: hello@repoos.org
branch: feat/align-remote-runners-tab-rows-and-docume
created_at: "2026-10-02T03:12:11Z"
---
## Problem

On **Checks → Remote runners**, each host card shows repeated label/value rows (Running now, Queue, Last completed). The layout looks messy because rows do not share consistent spacing and column alignment — fields jump horizontally and vertically compared with neighboring hosts and with other table-like lists elsewhere in the app. The same “loose row” pattern keeps showing up in new UI work because there is no shared agent guidance for how to lay out repeated, table-like rows.

## Desired UX

- On the **Remote runners** tab, every host card presents the same fact rows with aligned labels and values: readable at a glance, stable when content length varies (long task ids, multiple active runs, empty queue).
- When engineers add or touch UI that renders **repeated rows of labeled fields** (not necessarily a literal `<table>`), they follow a documented convention: labels share one column width, values align in a second column, spacing is consistent row to row, and wrapping does not break the column grid.
- The tab should match the visual discipline of other dense RepoOS panels (mono ids, status chips, dim empty states) without a one-off hack that only applies to this screen.

## Acceptance criteria

- [ ] **Remote runners tab:** `Running now`, `Queue`, and `Last completed` rows use a consistent grid or fixed label column so labels and values line up within a host card and look orderly when multiple host cards are stacked.
- [ ] **Remote runners tab:** Multi-value cells (e.g. several active runs, queue hints) wrap without collapsing label alignment or producing uneven row heights compared with sibling rows on the same card.
- [ ] **Agent guidance:** `AGENTS.md` includes a **Conventions** bullet instructing agents that table-like repeated row UIs must use aligned label/value columns and consistent row spacing; prefer shared patterns in `src/ui-app/src/style.css` when the same layout appears more than once.
- [ ] **Scaffold parity:** The `AGENTS.md` string in `src/commands/init.ts` is updated if it mirrors conventions shipped to other repos (only the new row-layout rule — do not rewrite unrelated template text).
- [ ] **Regression:** Existing remote-runner behavior (polling, empty/disabled states, Hetzner single-VM copy) is unchanged; this is layout/CSS only unless a minimal markup tweak is required for alignment.
- [ ] **Quality gate:** `bun run fmt` and `repoos check --changed main` pass.
- [ ] **Review evidence:** Task includes a `## Shots` entry showing **Checks → Remote runners** with at least two host cards (or a representative mock/story) so review can see aligned rows.

## Notes for AI

- Primary implementation target: `src/ui-app/src/components/RemoteRunnersPanel.vue` (`.rr-facts` today uses flex-wrap with per-row `dt`/`dd`, which likely causes the reported misalignment). Parent tab: `src/ui-app/src/views/ChecksView.vue`.
- Before inventing new classes, grep `src/ui-app` for similar `dl` / label-value row patterns; if one already exists, extend `style.css` with a reusable utility (e.g. `.kv-rows` or match an existing name) and use it here.
- Do **not** scope-creep into a full-app audit of every list; fix the reported screen and land the `AGENTS.md` rule so future work stays aligned. Opportunistically reuse the shared class only where you already touch the same pattern in this change.
- Follow existing UI rules: full-width Checks view (#0602), theme tokens (no hard-coded colors), teleported overlays unchanged.
- Assumption: alignment means a **two-column label/value grid** within each host card, with multiple host cards sharing the same column widths where practical (CSS grid on `.rr-facts` or equivalent).

## Scope

- **In scope:** Remote runners tab layout polish; durable agent convention in this repo’s `AGENTS.md` (+ init template if applicable); optional shared CSS helper for label/value rows.
- **Out of scope:** Redesigning the Checks page tabs, changing remote-validation APIs, or refactoring unrelated settings/drawer runner UI unless required to share one alignment helper with no behavior change.

## Related

- #0564 — Check run observability / Remote runners tab.
- #0602 — Checks page full-width layout.

## Original prompt

Make the checks > remote runners tab more aligned, now it looks messy due to the rows having different spacing. And in general since this seems to keep popping up all over the app: can we add an agent design instruction that anywhere we have repeated rows like that which are table-like, please make the fields aligned and pretty.

## Screenshots

![Screenshot-2026-09-30-at-12.27.45](/api/tasks/0623/attachments/screenshot-1.png)

## Shots
```json
[{"target": "default", "route": "/checks?tab=remote", "label": "Remote runners host cards with aligned label/value rows", "highlight": ".rr-facts", "steps": [{"waitFor": ".rr-host, .rr-empty"}, {"waitMs": 3500}]}]
```

## Activity

- 2026-10-02T03:12:11Z · created · hello@repoos.org
- 2026-10-02T03:12:11Z · screenshots
- 2026-10-02T03:12:48Z · status draft→inbox, title, area, body
- 2026-10-02T03:13:12Z · status inbox→ready
- 2026-10-02T03:13:50Z · status ready→active, branch
- 2026-10-02T03:15:42Z · body: section Shots
- 2026-10-02T03:37:13Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-10-02T03:49:39Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-02T03:49:39Z · status review→active
- 2026-10-02T03:53:34Z · status active→review

