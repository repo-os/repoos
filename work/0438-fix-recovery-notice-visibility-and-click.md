---
id: "0438"
title: Fix recovery notice visibility and clicks over task drawers
type: bug
status: done
priority: p1
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-19T05:23:55Z"
updated_at: "2026-09-19T05:56:17Z"
---
## Problem

The stale-UI recovery notice introduced by #0420 is hard to read and operate when a task drawer or other overlay is open. Its background uses the translucent --panel token, it spans nearly the full viewport width, its native buttons do not meet RepoOS button contrast/affordance conventions, and it remains inside the app stacking context rather than being teleported to the document body.

## Required UX

- Render the recovery notice through a Teleport to body so it is reliably above task drawers and overlays and its actions remain clickable.
- Use an opaque surface token such as --panel-solid, with a clearly legible border and shadow.
- Make it a compact attention card, centered near the top: width sized to its actual content with a sensible desktop maximum around 480–560px and responsive margins on narrow screens. It must not span the viewport.
- Use the standard RepoOS button treatment for Reload now and Dismiss, with clear hierarchy and comfortably sized hit targets.
- Keep stale and offline messaging distinct. Preserve the current reload intent and no-data-loss behavior.
- Add component/browser regression coverage with a task drawer open proving the card is above it, readable, and both actions can be clicked.

## Acceptance

With a task panel open, the recovery card is visually opaque, compact, easy to read, and both Reload now and Dismiss respond.

## Activity

- 2026-09-19T05:23:55Z · created · unknown
- 2026-09-19T05:37:26Z · status inbox→ready
- 2026-09-19T05:37:26Z · note: Promoting to a main-checkout hotfix after post-release UI verification found the banner unusable over drawers.
- 2026-09-19T05:37:56Z · status ready→active
- 2026-09-19T05:37:56Z · note: Implementing as an immediate direct-main UI hotfix.
- 2026-09-19T05:43:10Z · watchdog: auto-surfaced stuck task · status active→ready · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-09-19T05:56:17Z · status ready→done
- 2026-09-19T05:56:17Z · note: Direct-main hotfix b816f5ab was already committed and passed repoos check; closing without agent dispatch or review.
