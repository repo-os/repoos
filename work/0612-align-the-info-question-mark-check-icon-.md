---
id: "0612"
title: Align detected-agent driver column and compatibility icons
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/align-detected-agent-driver-column-and-c
created_at: "2026-10-01T09:01:31Z"
updated_at: "2026-10-01T09:09:02Z"
---
## Problem

On **Agents → Detected coding agents**, each row mixes labels and actions in one flex line. The **RepoOS driver** / **detected only** badge, the compatibility **info / question / check** control, version text, PATH binary **dropdown**, install/auth **hints**, update **copy command**, and related inline content do not read as a stable table. The compatibility icon especially drifts relative to the driver label because version, selects, and hints sit between the driver column and the icon, so rows look uneven and harder to scan.

## Desired UX

Each detected-agent row reads as clear left-to-right columns:

1. **Leading identity** (unchanged in intent): color dot, agent name, status pill, then the **RepoOS driver** or **detected only** badge (and **Deprecated** when shown), still in fixed-width columns so labels line up row to row.
2. **Compatibility column** immediately after the driver (and deprecated badge when present): the compatibility icon button sits here on every row that has compatibility data, **vertically centered** and **horizontally aligned** with the same x-position across all rows (including rows without version/hints). Rows without a compatibility control keep the column width so nothing shifts.
3. **Details column** to the right of the compatibility column: everything else for that row — **version**, multi-binary **Select**, probing spinner (if it stays on the row), update **details/summary**, install/auth **hint** code + copy, migration inline text — grouped here and **left-aligned** within the column, wrapping on narrow widths per existing responsive behavior.

The result should look like a tidy two-column “meta” block (icon column + details column) after the fixed driver labels, not a single jumbled flex gap.

## Acceptance criteria

- [ ] On the Detected tab, the compatibility icon (info / question / check) appears directly after the **RepoOS driver** / **detected only** column (and after **Deprecated** when shown), not after version, dropdown, or hints.
- [ ] Compatibility icons align to the same horizontal position on every row that shows one; rows without an icon preserve spacing so driver labels and icons in other rows do not shift.
- [ ] Version string, binary PATH dropdown, install/auth hints (with copy), update detail/copy command, and other secondary inline controls live in the **next** column to the right of the compatibility column, all **left-aligned** within that column.
- [ ] Existing row content (badges, colors, compat popover/card behavior, copy buttons, update checks) still works; this change is layout-only unless markup restructuring requires minimal class moves.
- [ ] Narrow viewport behavior (`max-width: 760px` wrap) remains usable: wrapped lines stay readable and do not overlap the compat popover.
- [ ] After UI changes, `bun run build:ui` (or full build) is run so `dist/` is fresh for check/handoff.

## Notes for AI

- Primary surface: `src/ui-app/src/views/AgentsView.vue` — `detect-row` / `detectRows` template (~lines 896–1040) and `src/ui-app/src/style.css` — `.detect-row`, `.detect-driver-yes/no`, `.detect-compat-icon`, `.detect-ver-inline`, `.detect-binary-select`, hint/update classes (~8010+).
- Existing CSS already fixes name, status pill, and driver badge widths; extend that pattern with explicit sub-containers (e.g. driver+deprecated group, fixed-width compat slot, flex `details` column) rather than ad hoc margins on individual spans.
- **Assumption:** “info/question mark/check icon” means the existing `.detect-compat-icon` driven by `compatibilityIcon()` / `r.agent.compatibility`, not the row spinner or star favorite button (those stay in the details column or trailing actions unless layout demands otherwise).
- **Assumption:** **Deprecated** stays with the driver label group (before the compat column); only version/hints/dropdown/update/migration inline move into the details column.
- Reuse global form/dialog conventions; do not introduce raw `<select>` for binaries (keep the styled `Select`).
- Add `data-overlay-layer` on any new body-teleported overlay if introduced (unlikely for this task).
- Declare `## Shots` at handoff with 1–2 entries on `/agents` Detected tab showing aligned rows with and without compat icons, hints, and multi-binary dropdown.

## Scope

**In scope:** Column structure and CSS for detected-agent rows on Agents → Detected.

**Out of scope:** Changing detection logic, update-check API, compatibility scoring, other Agents tabs (Configured, Skills), or board/drawer layouts.

## Related

- Agents view route: `/agents` (`AgentsView.vue`, `src/ui-app/src/router.ts`).

## Original prompt

Align the info/question mark/check icon to come right after the "repoos driver" / "detected only" column, and make them all aligned so it's prettier. Anything else - version, install cmd, hints, dropdown select should come in the next column, also left aligned.

## Screenshots

![Screenshot-2026-09-30-at-20.50.39](/api/tasks/0612/attachments/screenshot-1.png)

## Activity

- 2026-10-01T09:01:31Z · created · hello@repoos.org
- 2026-10-01T09:01:32Z · screenshots
- 2026-10-01T09:02:02Z · status draft→inbox, title, area, body
- 2026-10-01T09:02:14Z · status inbox→ready
- 2026-10-01T09:02:23Z · status ready→active, branch
- 2026-10-01T09:09:02Z · status active→review
