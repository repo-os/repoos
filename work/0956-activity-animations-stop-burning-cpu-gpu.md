---
id: "0956"
title: "Activity animations: stop burning CPU/GPU (pause when hidden or off screen, reduced motion, cap concurrent, cheaper rendering)"
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-25T03:58:48Z"
updated_at: "2026-10-28T16:46:38Z"
---
## Problem

The activity indicators (RGB keystorm and the other styles in `components/activity-art/`, shown by `ActivityIndicator.vue` on every working task card, the drawer and elsewhere) animate continuously. The keystorm art alone is an SVG of about 35 separately animated elements (24 keys, 4 fingers, 6 code glyphs), animated with CSS keyframes that repaint. With several tasks working there are well over a hundred on screen. Chrome Task Manager on Nick's machine shows the browser GPU Process steadily at about 30% CPU and the RepoOS app renderer spiking to 95% and holding about 710 MB, on a machine already under heavy load. Nick wants fun animations without the system load.

## Desired behavior

1. Animations pause when the tab or window is hidden (Page Visibility) and when an indicator is off screen (IntersectionObserver), and resume when visible.
2. `prefers-reduced-motion` is honored everywhere: a static frame instead of motion.
3. A cap on simultaneous animated indicators (for example 6 to 8 on screen at once); the rest show the static frame. Configurable in Settings (with a UI control, per AGENTS.md) with a sensible default.
4. Cheaper rendering. Measure first, then pick: (a) restructure the art so motion uses only transform and opacity on a few layers (compositor-only, no repaint) instead of animating many SVG paints; (b) stepped animation at a low frame rate (steps() at 8 to 12 fps), which suits the pixel style and cuts work a lot; (c) a pre-rendered sprite sheet or small looping animated WebP/AVIF/video for the busy styles, driven by one transform or a video element; (d) one shared ticker instead of per-element timers. Evaluate Lottie (lottie-web / dotLottie) and Rive as authoring tools; prefer using them to EXPORT sprite sheets or animated WebP rather than shipping their runtimes, because the repo has a zero-runtime-dependency rule (AGENTS.md) and per-instance runtimes cost more than CSS for dozens of small indicators. If a runtime library is judged worth it for a few large hero animations, say so in the notes and wait for explicit approval; do not add it.

## Acceptance criteria

- [ ] A written before/after measurement in the task notes: Chrome GPU process and renderer CPU with 6 working task cards visible, plus frame rate (record how it was measured, for example headless Chromium tracing).
- [ ] No animation runs while the document is hidden or an indicator is off screen (test with fake visibility and intersection).
- [ ] Reduced motion shows static art for every style; test it.
- [ ] The concurrency cap works, is configurable from Settings, and degrades to the static frame without layout shift.
- [ ] Every existing activity style still looks right (same shapes, same sizes, one fixed footprint); declare shots for the Settings preview and a board with several working cards, and look at them.
- [ ] No new runtime dependency; contrast audit and hard-coded-color guard pass; theme tokens stay.
- [ ] Docs and the Settings copy updated.

## Notes for AI

- Start by measuring on main (a board with several working fixtures) so the change is proven, not assumed.
- Do not start a second RepoOS server from a worktree (see bug #0954); use headless Playwright against the shot fixtures.

## Desired UX
Animated indicators stay fun and visible, but they cost almost nothing: they only move while on screen in a visible tab, respect reduced-motion, never exceed a small configurable number at once, and a busy board with many working tasks no longer makes the browser's GPU process or the machine fans work hard. See Desired behavior below for the specifics.

## Activity

- 2026-10-25T03:58:48Z · created · njachowski@gmail.com
- 2026-10-25T03:58:58Z · needs_input
- 2026-10-25T03:59:21Z · body: Desired UX (added)
- 2026-10-25T11:12:35Z · needs_input
- 2026-10-26T18:55:20Z · status inbox→ready
- 2026-10-28T16:46:38Z · cli_override, model_override
