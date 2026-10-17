---
id: "0813"
title: Add configurable activity animation size slider with Auto sizing
type: feature
status: active
priority: p2
area: [web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/add-configurable-activity-animation-size
created_at: "2026-10-17T05:02:36Z"
updated_at: "2026-10-17T05:02:56Z"
---
## Problem

The human wants to control activity animation size because compact indicators can be difficult to see at small task-label sizes. They approved a Settings size slider ranging from 1ch to 3ch in 0.5ch increments, with an Auto option preserving existing per-style sizes.

Follow-up to #0787, #0798 and #0807. Current compact styles reserve 1.5ch, 1.75ch (Orbital pixel), or 2ch (brackets, spark, hopper, paws). Artwork mixes em, ch and fixed-pixel geometry; changing only --ai-w would mostly change whitespace and would not reliably resize the animated artwork.

## Desired UX

- Add an animation size control alongside the existing Activity animation style selector in Settings. Provide Auto plus a native range slider with steps 1, 1.5, 2, 2.5 and 3ch. Show the selected value clearly. Auto is the default and retains each style's current appearance and dimensions; use existing form/control design conventions and accessible labels.
- The chosen numeric value is the target inline animation allocation in character widths of the surrounding label font. Scale artwork, motion distances, strokes/dots and reserved layout space together, preserving proportions. Do not stretch artwork horizontally or just add empty space. Reserve the full animated envelope so motion does not clip or overlap adjacent labels. Retain the established compact style's margins within its slot.
- Changing size updates the existing coding/reviewing/agent Settings preview immediately, and persists using the existing Settings save behavior. Expose the identical setting in repoos.toml and getConfigSchema(); use a stable documented representation for Auto and the five allowed numeric values. Missing config defaults to Auto, preserving existing repositories.
- Apply the preference consistently through the shared ActivityIndicator, including real task cards, drawer/status contexts, all current styles, Arcade hopper, Puppy tracks, and the legacy Three dots option. Auto keeps the legacy dots' original width/appearance; explicit numeric sizing must scale its entire animated group consistently. Do not silently ignore the size control for a style. Verify any existing sm/md callers and keep intended context differences when Auto is selected.
- Labels, activity colors, motion timing and animation style selection remain unchanged. Keep Orbital pixel as the default style. Do not automatically increase global label font size to resize an indicator.
- Support 1ch even though complex shapes may lose detail; do not silently clamp it to a larger size. Make it possible to judge through the actual-size preview. Larger options may require more vertical room: reserve the necessary height, align marks with the status label, and prevent clipping, neighboring-row overlap or card overflow. Avoid CSS transforms that enlarge only the pixels without informing layout.
- Respect reduced motion at every size: display a legible static mark and preserve accessible status labels without announcing animation frames.

## Notes for AI

Inspect src/ui-app/src/components/ActivityIndicator.vue and the activity indicator CSS in src/ui-app/src/style.css, including per-style keyframes, dot/glow rules, matrix positions, hopper/paw geometry, and reduced-motion overrides. Use a shared scaling/measurement approach with a layout wrapper around a consistently sized animation canvas so fixed-pixel and em/ch details scale as one unit. Keep keyframe transforms on nested artwork separate from global sizing transforms so they do not overwrite each other. Account for animated envelope dimensions, not merely a resting bounding box. Do not assume a ch equals a pixel or an em; it depends on the label's actual font.

Prefer one global size preference applied across styles rather than per-style saved sizes. Use the established configuration validation, schema, store persistence and Settings preview paths; update directly affected user docs with Auto, supported values and default behavior. No runtime dependencies or unrelated Settings redesign.

## Acceptance criteria

- Settings provides Auto and the five size steps with a clearly labeled, keyboard-operable range control; preview updates live and values persist across reload. repoos.toml and Settings round-trip the same value.
- Config tests cover missing/Auto defaults, all valid numeric steps, and rejection of invalid/out-of-range/non-step values through supported write paths; follow existing config parsing conventions.
- Auto preserves existing appearance and layout for all styles, including legacy Three dots and any sm/md contexts. Existing selected style and Orbital pixel default remain intact.
- Browser-level checks render the real shared component at each numeric size and multiple realistic label font sizes (including 9–12px task hints), verifying proportional artwork and motion scaling, measured reserved width, and no clipping or label overlap. Assertions must catch a width-only/no-artwork-scaling implementation.
- Verify every style and all three activity states, including hopper/paws and legacy dots; check maximum animated bounds over time. At 3ch, task-card/drawer rows remain aligned and usable at narrow widths. Changing size does not cause animation speed or colors to change.
- Verify representative light/dark themes, reduced motion, accessible range controls and stable visible static marks. Capture Settings and actual card evidence; still screenshots alone do not establish correct motion scaling.
- Rebuild after UI changes, run focused meaningful tests and scoped repoos check, and hand off through normal RepoOS review.

## Activity

- 2026-10-17T05:02:36Z · created · njachowski@gmail.com
- 2026-10-17T05:02:52Z · status inbox→ready
- 2026-10-17T05:02:56Z · status ready→active, branch
