---
id: "0410"
title: Fix mobile horizontal overflow on the landing page and VitePress docs site
type: bug
status: review
priority: p2
area: "landing, user-docs"
assigned_to: ai
created_by: ""
branch: feat/fix-mobile-horizontal-overflow-on-the-la
created_at: "2026-09-18T12:51:45Z"
updated_at: "2026-09-18T18:46:38Z"
review_passes: 3
review_rounds: 1
handoff_signal_retry_count: 2
skill_suggestion: "0424"
---
#0409 was meant to fix horizontal overflow on the landing page (landing/) and VitePress docs site (user-docs/), but it changed only the in-app RepoOS UI. #0410 then suppressed the symptom with root-level overflow-x: clip; that prevents page scrolling but clips oversized content. The attached mobile screenshot shows the landing hero, body copy, installation tabs, and command box still wider than the viewport.

## Required correction

Do not use html/body overflow-x: clip or hidden as the layout fix. Remove that rule from both sites and fix the overflowing elements at their own layout boundary.

Landing:
- Give the hero grid's first child min-width: 0 so its heading cannot establish an oversized grid minimum.
- Make the mobile heading responsive in the 640–767px range; the current sm:text-[54px] is too large there. Preserve readable wrapping rather than clipping a forced line.
- Make all six install choices usable at phone widths (a two-row grid on small screens is preferred; a clearly scrollable local tab strip is acceptable). Keep the command itself locally horizontally scrollable.

Docs:
- Keep VitePress code blocks, code-group tabs, and tables locally horizontally scrollable; do not clip them at the document root.
- Use targeted min-inline-size: 0 and prose/link overflow wrapping only where an actual content/container boundary needs it. Do not apply a blanket max-width reset that breaks VitePress's intentionally full-bleed mobile code blocks.

## Acceptance criteria

- No page-level horizontal overflow and no clipped text/control at 320, 375, 480, 640, and about 708px CSS widths, for both Landing page and Docs site preview targets.
- Long commands, tables, and code-group tabs remain accessible via their own local horizontal scrolling.
- Verify document.documentElement.scrollWidth <= window.innerWidth at each viewport, then manually inspect the Landing page hero/install control and the Docs install code group.
- Desktop layouts remain unchanged.

## Notes for AI

- Two separate apps: landing/ (Vite) and user-docs/ (VitePress, custom theme under user-docs/.vitepress). Fix each in its own tree.
- Do not touch src/ui-app; #0409 already handled the in-app UI.
- Rebuild each site and verify using the Landing page and Docs site preview targets from repoos.toml, not the default RepoOS UI.

## Activity

- 2026-09-18T12:51:45Z · created · unknown
- 2026-09-18T15:01:27Z · area
- 2026-09-18T17:22:37Z · status inbox→ready
- 2026-09-18T17:23:04Z · status ready→active, branch
- 2026-09-18T17:31:22Z · status active→review
- 2026-09-18T18:33:43Z · body
- 2026-09-18T18:33:43Z · status review→active
- 2026-09-18T18:39:26Z · status active→review
- 2026-09-18T18:40:01Z · status review→active
- 2026-09-18T18:41:02Z · status active→review
- 2026-09-18T18:41:03Z · status review→active
- 2026-09-18T18:46:38Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
