---
id: "1112"
title: Build the web mobile shell and bottom navigation
type: feature
status: inbox
human_step_decision: agent
human_step_decision_key: 0c4974e5
priority: p1
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-14T09:10:42Z"
updated_at: "2026-11-14T09:10:44Z"
---
## Problem
RepoOS's single SPA has no phone-specific navigation composition. Desktop chrome and scattered narrow CSS do not provide a coherent phone shell.

## Desired outcome
Below 720 CSS px, users get a purpose-built mobile shell with bottom navigation for Work, Search, More and Settings. At 720 px and above the desktop shell remains unchanged.

## Acceptance criteria
- Add a small reactive layout composable based on viewport width (720 px threshold), not touch detection.
- Render a mobile-only shell in the existing SPA with Work, Search, More and Settings destinations; More exposes secondary destinations such as Agents, Context, Activity and Releases when configured.
- Preserve URL-addressable routes and browser Back behavior; navigation remains accessible by keyboard and touch.
- Keep desktop composition unchanged at/above 720 px, including 768 px tablet behavior.
- Use existing router, auth and stores; do not create a second app/build or add runtime dependencies.
- Use shared dialog/overlay conventions and ensure no horizontal page overflow below the breakpoint.
- Add component coverage for breakpoint transitions, navigation destinations and desktop unchanged behavior.
- Update the PWA manifest/install metadata only as needed for browser installation basics; no offline mutation or native shell work.

## Activity

- 2026-11-14T09:10:42Z · created · t@t
