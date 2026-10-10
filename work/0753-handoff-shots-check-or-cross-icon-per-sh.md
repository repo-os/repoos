---
id: "0753"
title: "Handoff shots: check or cross icon per shot, drop the duplicate verification block"
type: feature
status: active
priority: p2
area: [web, ui]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/handoff-shots-check-or-cross-icon-per-sh
created_at: "2026-10-10T10:13:24Z"
updated_at: "2026-10-10T10:24:04Z"
---
## Problem

The Changes tab shows the handoff UI verification twice: a summary block (date, tested tree, sentence, console issues and warnings) and then the same shots again under UI changes. The summary block is extra text that repeats the shots. Users only need to know whether each shot is correct.

## Desired UX
- Remove the "Handoff UI verification" summary block from the Changes tab.
- Show one list: each shot is a row under UI changes. The row shows its caption and thumbnail, plus a green check (matches) or red cross (check).
- Hovering or focusing the icon opens a popover with the plain-words reason, for example "couldn't find the fullscreen toggle", and that shot's own console errors, failed same-origin requests, overflow and blank-capture issues.
- Issues belong to a shot. The gate already collects them per capture, but the stored record keeps one list for the whole handoff. Store each capture's issues on that capture, and show a run-level issue (one not tied to any shot) under the list as a single line.
- The tested tree and capture time go in one line above the list, not a separate block.

## Acceptance criteria
- [ ] The "Handoff UI verification" summary block no longer renders on the Changes tab.
- [ ] Each shot row under UI changes shows a green check or red cross, derived from the same step results as the current verdict.
- [ ] Each capture's console errors, failed same-origin requests, overflow and blank-capture issues are stored on that capture in the handoff record, and shown in that shot's popover.
- [ ] A run-level issue not tied to a shot is shown once under the list, not repeated per row.
- [ ] Hovering and keyboard focus both open the popover; tap opens it on touch screens.
- [ ] The popover uses the shared tooltip or popover component, not a native title attribute.
- [ ] Tests cover a matching shot, a checking shot with a failed step, a shot with its own console error, and a run-level issue.


## Notes for AI

- The verdict logic already exists in src/ui-app/src/lib/handoff-verification.ts. Reuse it; do not add a second one.
- The summary block lives in src/ui-app/src/components/TaskDrawer.vue under the Changes tab (search "Handoff UI verification"). The shot rows under UI changes are rendered by the same file or by shot-rows.ts.
- Display-only. Do not change how shots are captured or how handoff gates work.
- Use the shared popover or tooltip component under src/ui-app/src/components/ui. No native title tooltips.
- Rebuild the UI with `bun run build:ui` after changes.

## Related

- #0751 (the earlier verdict and details change this replaces in part)
- #0750 (the task whose Changes tab showed the duplicate block)

## Activity

- 2026-10-10T10:13:24Z · created · njachowski@gmail.com
- 2026-10-10T10:13:30Z · status inbox→ready
- 2026-10-10T10:13:32Z · status ready→active, branch
- 2026-10-10T10:16:00Z · body: section Desired UX
- 2026-10-10T10:16:01Z · body: section Acceptance criteria
- 2026-10-10T10:22:59Z · body
- 2026-10-10T10:24:04Z · body
