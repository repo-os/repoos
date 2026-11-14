---
id: "1112"
title: Build the web mobile shell and bottom navigation
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Desired UX, Notes for AI"
human_step_decision: agent
human_step_decision_key: 0c4974e5
priority: p1
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-14T09:10:42Z"
updated_at: "2026-11-14T09:11:56Z"
---
## Problem
RepoOS's single SPA has no phone-specific navigation composition. Desktop chrome and scattered narrow CSS do not provide a coherent phone shell.

## Desired UX
Below 720 CSS px, users get a purpose-built mobile shell with bottom navigation for Work, Search, More and Settings. At 720 px and above the desktop shell remains unchanged.

## Acceptance criteria
- Add a reactive layout composable based on viewport width (720 px threshold), not touch detection.
- Render mobile-only shell in the existing SPA with Work, Search, More and Settings destinations; More exposes secondary destinations such as Agents, Context, Activity and configured Releases.
- Preserve URL-addressable routes and browser Back behavior; navigation is keyboard and touch accessible.
- Keep desktop composition unchanged at/above 720 px, including 768 px tablet behavior.
- Reuse existing router, auth and stores; do not create a second app/build or add runtime dependencies.
- Follow shared dialog/overlay conventions and ensure no horizontal page overflow below the breakpoint.
- Add coverage for breakpoint transitions, destinations and unchanged desktop behavior.
- Provide PWA install basics only as needed: valid manifest, icons, standalone display metadata and safe-area layout; no offline mutations or native shell.
## Notes for AI
Read ADR 0011 and UI conventions. Keep the change limited to the shell; Work queue, detail, Settings redesign and broad touch audit are separate tasks. Reuse the current route definitions and feature-gated navigation.

## Activity

- 2026-11-14T09:10:42Z · created · t@t
- 2026-11-14T09:10:44Z · needs_input
- 2026-11-14T09:11:56Z · body: Desired UX (added); Acceptance criteria (added 7, removed 7); Notes for AI (added); Desired outcome (removed)
