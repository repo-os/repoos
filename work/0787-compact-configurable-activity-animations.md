---
id: "0787"
title: Compact configurable activity animations; default to Orbital pixel
type: feature
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: the agent process exited with an error — open the task to see the full output
priority: p2
area: [web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/compact-configurable-activity-animations
cli_override: cursor
model_override: composer-2.5
review_cli_override: github copilot
review_model_override: default
created_at: "2026-10-15T05:23:43Z"
updated_at: "2026-10-15T07:18:13Z"
dev_error_count: 1
---
## Problem

Replace the space-hungry activity indicator with a configurable animation style. The human approved six compact animation families shown in this chat and requests all six plus the existing animation, with **Orbital pixel** as the new default. Expose the same setting in the Settings page and repoos.toml. Preserve the existing animation colors for each activity/state and theme.

The attached screenshot shows the current three horizontal dots beside "CODING · ACTIVE JUST NOW". The goal is to use about 1–2 monospace character widths for the indicator itself, rather than 4+ spaces. Keep the existing activity labels and behavior.

## Desired UX

Provide these seven named choices, using a single style selection for coding, reviewing, and general AI agent work. Each new family supports those activity states:

- **Orbital pixel (default)** — 1.5ch footprint. A faint circular track with a tiny pixel orbiting for coding (~1.6s); the pixel scans diagonally back and forth inside the circle for reviewing (~2s); a slower orbit for general agent activity (~2.6s).
- **Cursor / scan / pulse** — 1ch. A blinking vertical typing caret for coding (~1.1s); a thin horizontal line scanning vertically for reviewing (~1.6s); a breathing dot for general work (~1.7s).
- **Breathing brackets** — 2ch. Angle brackets gently open/close for coding (~1.5s); square brackets alternate emphasis for reviewing (~1.8s); breathing angle brackets for general work.
- **Micro dot matrix** — 1ch. Six tiny dots in a 2-column × 3-row matrix; staggered pulsing for coding, scan/twinkle for reviewing, and slow rotation for general work.
- **Tiny signal bars** — 1ch. Three narrow vertical strokes with a staggered typing rhythm for coding (~1.2s), sequential scan emphasis for reviewing (~1.8s), and a slower wave for general work (~2s).
- **Spark / diamond** — 1.5ch. A gently turning and breathing four-point spark for coding (~2.2s), a breathing hollow diamond for reviewing (~2.4s), and a slower spark for general work (~3s).
- **Existing animation / Three dots** — retain the current animation as an explicitly selectable compatibility option, including its current motion and spacing.

Reference prototype (local to the originating interactive session): /Users/nick/.codex/visualizations/2026/10/15/01a13ddd-613e-7170-8b22-eeb1a3ef9857/compact-agent-motion.html. This is a motion reference, not production code; the descriptions above are the durable specification if the file is unavailable on a runner. Prototype colors are NOT requested: inherit the app's existing animation colors/tokens, preferably through currentColor.

## Notes for AI

- Inspect and extend the shared ActivityIndicator component and its consumers rather than introducing divergent per-page implementations. Ensure coding, reviewing, and generic AI working indicators consistently honor the setting wherever the existing shared animation appears.
- Add a validated enum setting to repoos.toml configuration and getConfigSchema(), with a styled dropdown in the appropriate Settings tab. Use stable serialized option names. Omitted configuration defaults to Orbital pixel, including existing repos without an explicit choice. Explicit selection of the legacy animation preserves it. Follow existing save, reload, and config validation conventions.
- Preview the selected style in Settings so users can judge its motion and footprint before saving, following existing Settings conventions.
- Keep activity-state/theme color semantics exactly as they are today. Do not introduce fixed colors from the standalone prototype. Use the current working/reviewing/etc. tokens and opacity treatment; ensure contrast stays readable across supported themes.
- New indicators reserve a fixed 1–2ch inline footprint including their motion, with compact spacing to the label. Prevent layout shifts, clipping, and label overlap/wrapping caused by oversized indicator gaps. The legacy option may keep its original larger width.
- Respect prefers-reduced-motion with a legible static indicator. Preserve accessible status labels; do not announce animation frames. Animation must reflect actual active state and must not imply percentage completion.
- Document the setting, allowed values, and new default in directly affected user documentation.

## Acceptance criteria

- All seven options are selectable in Settings and configurable through repoos.toml; selection persists and round-trips correctly.
- With no explicit choice, coding/reviewing/AI work indicators use Orbital pixel.
- Each new style fits the intended 1–2 character-width budget at actual UI size; the existing three-dot animation remains available.
- All styles inherit the current activity/theme colors, including distinct reviewing colors where present.
- Verify config default/enum validation/persistence and shared component state/style selection with focused meaningful tests.
- Verify live coding, reviewing, and generic working examples, reduced motion, narrow task cards, and light/dark theme rendering. Rebuild after UI changes and run the scoped repoos check before review.

## Screenshots

![Current coding activity indicator: three horizontal dots occupy too much inline space](/api/tasks/0787/attachments/screenshot-1.png)

## Activity

- 2026-10-15T05:23:43Z · created · njachowski@gmail.com
- 2026-10-15T05:23:44Z · screenshots
- 2026-10-15T05:23:45Z · needs_input
- 2026-10-15T05:23:55Z · needs_input, body
- 2026-10-15T05:38:39Z · model_override
- 2026-10-15T05:38:40Z · status inbox→ready
- 2026-10-15T05:38:54Z · status ready→active, branch
- 2026-10-15T05:43:55Z · message_queued at 2026-10-15T05:43:55.916Z
- 2026-10-15T05:43:56Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-15T06:26:21Z · cli_override, model_override
- 2026-10-15T06:26:27Z · model_override
- 2026-10-15T06:26:33Z · review_cli_override, review_model_override
- 2026-10-15T06:42:37Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-15T07:17:25Z · body
- 2026-10-15T07:18:13Z · body
