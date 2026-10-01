---
id: "0611"
title: Row layout for task preview shots on Changes tab
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/row-layout-for-task-preview-shots-on-cha
model_override: opencode-go/space-bunny-free
created_at: "2026-10-01T04:34:32Z"
updated_at: "2026-10-01T04:58:58Z"
dev_error_count: 1
---
## Problem

On the task drawer **Changes** tab, captured preview shots (the **UI changes** section) use a compact thumbnail grid (`shot-grid` / `shot-thumb`). That layout leaves little room for the human-readable context reviewers need: the declarative shot spec in the task body (`## Shots` JSON) includes **label**, **steps**, and **selector** (plus target/route), but the UI mostly surfaces a short label or target string under each thumb.

New task and new input flows already use a clearer pattern: each attachment is its own row (`ff-pending-files` / `ff-pending-file`) with a thumbnail and text beside it. Preview shots on Changes should follow that same structure so spec details are visible at a glance during review.

## Desired UX

- In **UI changes**, list each captured preview shot as **one horizontal row**, visually aligned with the screenshot rows on **New task** and **New input** (shared `ff-pending-*` / `shot-dropzone` family in `style.css`, not a bespoke grid).
- Each row shows:
  - The shot image (clickable to open the existing full-size viewer, with expand control as today).
  - Primary text from the shot spec when available (**label**); sensible fallback when missing (e.g. target, route, or file name — match current fallbacks where possible).
  - Secondary detail drawn from the matching `## Shots` entry: **selector** when present, and a concise rendering of **steps** (e.g. click/fill/waitFor/waitMs sequence) when non-empty; omit or collapse gracefully when empty.
  - Target/route context where helpful (e.g. in the row text or `title` tooltip), consistent with today’s `target · route` hinting.
- Rows stack vertically with comfortable spacing so multiple shots (typical 1–3) read like a short checklist of what was captured, not a photo gallery.

## Acceptance criteria

- [ ] Task drawer **Changes** → **UI changes** uses the same row-based list structure/classes as New task / New input pending screenshot rows (`ff-pending-files` / `ff-pending-file` or an intentional shared variant in `style.css`), not `shot-grid` / `shot-thumb`.
- [ ] One captured preview shot per row; thumbnail + text column layout matches the established attachment row pattern.
- [ ] Each row displays the shot **label** from the task’s `## Shots` spec when the row can be matched to an entry; otherwise falls back without breaking layout.
- [ ] Each row shows **selector** and **steps** from the matched spec entry when present (readable, truncated with `title`/expand where long — no requirement to edit the spec inline).
- [ ] Clicking the thumbnail or expand still opens the existing multi-shot viewer at the correct index.
- [ ] No regressions to shot warning banner, code diff section below, or empty states on the Changes tab.
- [ ] UI test or component test updated/added if the repo already covers this surface; run `bun run fmt` and relevant tests.

## Notes for AI

- Primary touch: `TaskDrawer.vue` Changes tab block (~`taskShots`, `ui.activeTab === 'changes'`, **UI changes** section). Reference implementations: New task screenshots block in the same file (`ff-pending-files`) and `NewInputPanel.vue`.
- Merge **API shot list** (`repo.shotsFor` / `ShotMeta`: name, target, route, label, url) with **`parseShotPlan`** from `src/core/shot-plan.ts` on the active task body to obtain **steps** and **selector** (not on `ShotMeta` today). **Assumption:** match spec entries to captured shots by **index order** when counts align; when counts differ, match by `(target, route, label)` where possible and fall back to `ShotMeta` fields only — document the rule in code briefly.
- Reuse global styles in `src/ui-app/src/style.css`; extend shared classes if a captured-shot row needs a subtitle line for steps/selector — avoid large new scoped CSS in the drawer.
- Do **not** add remove/delete on captured preview shots unless product already supports it elsewhere (pending uploads are a different lifecycle).
- Do **not** change capture/storage (`work/.attachments/.../shots/`), handoff auto-capture, or the `## Shots` JSON schema — display only.
- After UI changes: `bun run build:ui` (or full build). Consider a **Shots** section in the task body when adding manual review screenshots to the task file per AGENTS.md if the diff is UI-visible.

## Scope

- In scope: **Changes** tab preview shots presentation in the task drawer.
- Out of scope: redesigning the `## Shots` author/editor UI, changing how shots are captured, or other grids (bug report, PM chat attachments).

## Related

- `#0582` / `#0594` — preview shots and declarative `## Shots` plan.
- `src/ui-app/tests/shot-plan.test.ts` — parsing reference for steps/selector shape.

## Original prompt

On the task panel ui changes sections where we show the shots taken by the task let's use the same styling/structure as we do on "new task" and "new input" screenshot upload, each screenshot it's own row. That way we have room on the row to show some of the relevant text content/description of what the shot is, e.g. the label, steps, selector which is in the task spec now:

[
  {"target": "default", "route": "/", "label": "Top bar bell popover", "steps": [{"click": "button[data-test-id=\"notice-bell-trigger\"]"}, {"waitMs": 400}], "selector": "[data-test-id=\"notice-bell-popover\"]"},
  {"target": "default", "route": "/", "label": "Needs-you panel with notice rows", "steps": [], "selector": "main"},
  {"target": "default", "route": "/settings?tab=notifications", "label": "Settings: release notification toggles", "steps": []}
]

## Shots

```json
[
  {"target": "default", "route": "/", "label": "Task drawer Changes tab: one row per captured preview shot", "steps": [{"waitFor": ".board"}, {"waitMs": 400}]},
  {"target": "default", "route": "/", "label": "New task screenshots: the attachment row the UI-changes rows now match", "steps": [{"click": ".new-btn"}, {"waitFor": ".shot-dropzone"}, {"waitMs": 400}]}
]
```

## Screenshots

![Screenshot-2026-10-01-at-12.24.16](/api/tasks/0611/attachments/screenshot-1.png)
![Screenshot-2026-09-30-at-20.53.22](/api/tasks/0611/attachments/screenshot-2.png)

## Activity

- 2026-10-01T04:34:32Z · created · hello@repoos.org
- 2026-10-01T04:34:34Z · screenshots
- 2026-10-01T04:34:34Z · screenshots
- 2026-10-01T04:35:12Z · status draft→inbox, title, area, body
- 2026-10-01T04:37:48Z · status inbox→ready
- 2026-10-01T04:37:52Z · status ready→active, branch
- 2026-10-01T04:37:54Z · agent exited with an error (opencode) · error: Upstream request failed: Insufficient account funds
- 2026-10-01T04:38:10Z · model_override
- 2026-10-01T04:38:13Z · needs_input
- 2026-10-01T04:58:58Z · body
