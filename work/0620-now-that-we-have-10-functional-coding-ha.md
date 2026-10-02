---
id: "0620"
title: Remove unimplemented harnesses and deprecated column from Agents
type: chore
status: review
priority: p2
area: [web, ui]
assigned_to: ai
created_by: hello@repoos.org
branch: feat/remove-unimplemented-harnesses-and-depre
created_at: "2026-10-02T00:22:00Z"
updated_at: "2026-10-02T00:32:40Z"
---
## Problem

RepoOS now supports ten headless coding harnesses with drivers. The **Agents → Detected** list still includes **Gemini**, **Aider**, and **Goose** as “detected only” rows even though there is no plan to implement drivers for them. That clutters the board and implies future support.

Gemini is also the only entry still marked **deprecated**, which drove a dedicated column/slot in the detected-agent row layout (#0612). With no deprecated agents left in the catalog, that column is empty noise and makes the row harder to scan.

## Desired UX

On **Agents → Detected coding agents**, users see only harnesses RepoOS actually supports (or might support with a driver): no Gemini, Aider, or Goose rows.

Each row shows name, status, driver badge, compatibility control, and details—without a reserved **Deprecated** column or badge. Alignment from #0612 should still hold (driver and compatibility columns line up); removing the deprecated slot should simplify the grid, not break compat alignment.

Existing tasks or settings that still reference legacy **Gemini CLI** (`cli = "gemini"`) may keep their preserved override warnings elsewhere in the UI; this task is about the detected-agent catalog and layout, not ripping out migration paths for saved config.

## Acceptance criteria

- [ ] **Gemini**, **Aider**, and **Goose** are not listed on the Detected tab and are not probed on PATH as part of the standard known-agent catalog.
- [ ] The Detected row UI has no **Deprecated** badge column/slot and no migration inline block tied to `agent.deprecated` on that tab.
- [ ] Remaining detected rows still align cleanly (name, status, driver, compatibility icon, details) without a gap where the deprecated column was.
- [ ] Tests and docs that assume Gemini/Aider/Goose appear in `KNOWN_AGENTS` or that the deprecated slot exists are updated; `repoos check --changed main` passes.
- [ ] Declare shots on `/agents?tab=detected` showing the simplified row layout (no deprecated column).

## Notes for AI

- Primary catalog: `KNOWN_AGENTS` in `src/core/detect.ts` — remove the `gemini`, `aider`, and `goose` entries.
- UI: `src/ui-app/src/views/AgentsView.vue` — drop `detect-deprecated-slot`, deprecated badge, and `detect-migration-inline` for deprecated agents; adjust layout/CSS in `src/ui-app/src/style.css` (`.detect-deprecated`, `.detect-deprecated-slot`, grid columns). Revisit #0612 flex/slot widths so compat alignment still works.
- Cleanup dead paths: `src/core/agent-updates.ts` (and `agent-updates.test.ts`) mappings for removed ids; any detect/doctor tests that count or name these agents.
- **Do not** remove Antigravity (`agy`) or other drivable harnesses.
- **Assume** legacy `cli = "gemini"` in `repoos.toml` and `isLegacyGeminiCli` notices in `TaskDrawer.vue` stay until a separate task says otherwise; `agents.ts` may still refuse to run `gemini` for saved overrides.
- Optional type cleanup: `deprecated` / `migrationUrl` / `migrationNote` on `KnownAgent` only if nothing references them after removal.
- Update `user-docs/agents.md` (Gemini deprecation / “remains visible in Detected”) and any compatibility doc lines that list the removed tools as catalog entries.
- `src/ui-app/tests/shot-plan.test.ts` still mentions `.detect-deprecated-slot` from #0613 — update to match the new layout.
- Rebuild UI after changes (`bun run build:ui` or full build).

## Scope

**In scope:** Detected-agent catalog, Agents UI layout, related tests/docs, update-check mappings for removed ids.

**Out of scope:** Implementing Aider/Goose/Gemini drivers; redesigning the whole Agents page; changing AGENTS.md template mentions of Aider as a generic example.

## Related

- #0612 — row alignment including deprecated slot (superseded visually by this change).
- Task draft **0620** (same user request; screenshot on file).

## Original prompt

Now that we have 10 functional coding harnesses let's remove Gemini, Aider and Goose from the list (I don't plan to implement them, so better not to show them at all). And remove the "deprecated" column since none will be deprecated anymore, so visually it should look nicer.

## Screenshots

![Screenshot-2026-10-02-at-08.20.00](/api/tasks/0620/attachments/screenshot-1.png)

## Activity

- 2026-10-02T00:22:00Z · created · hello@repoos.org
- 2026-10-02T00:22:01Z · screenshots
- 2026-10-02T00:22:36Z · status draft→inbox, title, area, type, body
- 2026-10-02T00:24:48Z · status inbox→ready
- 2026-10-02T00:24:50Z · status ready→active, branch
- 2026-10-02T00:32:40Z · status active→review
