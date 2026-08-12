---
id: "0137"
title: "Add pink diagonal \"Preview\" banner to preview links"
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-12T11:57:02Z"
updated_at: "2026-08-12T11:57:13Z"
---
## Problem

When a task has an active preview, the preview link blends in with other UI elements and is easy to miss. Users need a quick, unmistakable visual cue to identify which tasks have a live preview available.

## Desired UX

Any task card or row that has an active preview displays a small pink diagonal banner in its top-left corner. The banner reads "Preview" in bold white or dark text, angled diagonally so it stands out without obstructing the task title or other card content. The banner is css-only (no extra assets) and subtle enough not to dominate the layout, but obvious enough that a user scanning the list can instantly spot which tasks have previews.

## Acceptance criteria

- [ ] Task cards/rows with an active preview show a "Preview" banner in the top-left corner
- [ ] The banner is pink, diagonal (~ -40 to -45 degrees), with bold text
- [ ] It does not overflow or clip awkwardly at the card boundary
- [ ] Tasks without a preview do not show the banner
- [ ] `repoos check` passes (build, typecheck, tests, UI smoke test)

## Notes for AI

- Implement in the Vue UI components under `src/ui-app/`. The relevant component is likely the task list item or card component that renders preview URLs (look for where preview links or preview-related data is displayed).
- Keep the banner CSS-only: use transforms, pseudo-elements, or absolutely positioned spans. Do not add images or SVG assets.
- Pink color suggestion: something like `#e91e63` or `#f06292` — pick one that looks good against the existing UI palette.
- Assume "preview available" is already surfaced in the task data model (e.g. a `preview` field or URL property). Check the existing data flow before wiring the banner — if the data isn't available, scope that out and note it here.
- Only conditionally render the banner when a preview is actually present.
- After any UI change, rebuild (`bun run build:ui` or `bun run build`) and verify visually.

## Activity

- 2026-08-12T11:57:02Z · created · unknown
- 2026-08-12T11:57:13Z · status inbox→ready
