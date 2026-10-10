---
id: "0753"
title: "Handoff shots: check or cross icon per shot, drop the duplicate verification block"
type: feature
status: review
priority: p2
area: [web, ui]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/handoff-shots-check-or-cross-icon-per-sh
created_at: "2026-10-10T10:13:24Z"
updated_at: "2026-10-10T11:12:10Z"
---
## Problem

The Changes tab shows the handoff UI verification twice: a summary block (date, tested tree, sentence, console issues and warnings) and then the same shots again under UI changes. The summary block is extra text that repeats the shots. Users only need to know whether each shot is correct.

## Desired UX

- Remove the "Handoff UI verification" summary block from the Changes tab.
- Each shot row under UI changes gets a single icon: a green check when the shot matches, a red cross when it needs checking.
- Hovering or focusing the icon opens a popover that explains the verdict in plain words, for example "matches: every declared step ran and the capture was taken", or "check: couldn't find the fullscreen toggle".
- The popover also shows the console errors, failed same-origin requests, overflow or blank-capture issues for that handoff, so the information the block carried is not lost.
- The tested tree and capture time move into the popover or a small line under the section title, not a separate block.

## Acceptance criteria

- [ ] The "Handoff UI verification" summary block no longer renders on the Changes tab.
- [ ] Each shot row under UI changes shows a green check or a red cross icon, derived from the same step results as the current MATCHES/CHECK verdict.
- [ ] Hovering and keyboard focus on the icon both open a popover with the plain-words reason.
- [ ] The popover lists console errors, failed same-origin requests, overflow and blank-capture issues for the handoff, when there are any.
- [ ] The popover uses the shared styled tooltip or popover component, not a native title attribute, and works on touch screens (tap opens it).
- [ ] Tests cover a matching shot, a checking shot with a failed step, and a handoff with issues.

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
- 2026-10-10T11:12:10Z · status active→review
