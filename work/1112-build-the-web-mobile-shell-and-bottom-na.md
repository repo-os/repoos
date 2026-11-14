---
id: "1112"
title: Build the web app mobile navigation and bottom bar
type: feature
status: review
human_step_decision: agent
human_step_decision_key: fa45dc32
priority: p1
area: web
assigned_to: ai
created_by: t@t
branch: feat/build-the-web-app-mobile-navigation-and-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T09:10:42Z"
updated_at: "2026-11-14T11:18:28Z"
---
## Problem
RepoOS's single SPA has no phone-specific navigation composition. Desktop chrome and scattered narrow CSS do not provide a coherent phone shell.

## Desired UX
Below 720 CSS px, users get a purpose-built mobile shell with bottom navigation for Work, Search, More and Settings. At 720 px and above the desktop shell remains unchanged.

## Acceptance criteria
- Add a reactive layout composable based on viewport width (720 px threshold), not touch detection.
- Render a mobile navigation composition within the existing server-served SPA, with Work, Search, More and Settings destinations; More exposes secondary destinations such as Agents, Context, Activity and configured Releases.
- The same narrow-screen web composition must work in a plain phone browser, the Capacitor host's isolated WebView, and an installed home-screen web app.
- Preserve URL-addressable routes and browser Back behavior; navigation is keyboard and touch accessible.
- Keep desktop composition unchanged at/above 720 px, including 768 px tablet behavior.
- Reuse existing router, auth and stores; do not create a second app/build or add runtime dependencies.
- Do not replace or alter the Capacitor host's multi-server picker, lock screen, or isolated WebView security boundary.
- Follow shared dialog/overlay conventions and ensure no horizontal page overflow below the breakpoint.
- Add coverage for breakpoint transitions, destinations and unchanged desktop behavior.
- Provide PWA install basics only as needed: valid manifest, icons, standalone display metadata and safe-area layout; do not implement offline mutations or a second native connected-server composition.

## Notes for AI
Read ADR 0011, docs/mobile-architecture.md and UI conventions. This task builds navigation inside the server-served web app, not the Capacitor host shell. Preserve the native host's server picker, lock screen and isolated WebView security boundary. Keep Work queue, detail, Settings redesign and broad touch audit in their separate follow-up tasks. Reuse current route definitions and feature-gated navigation.

## Activity

- 2026-11-14T09:10:42Z · created · t@t
- 2026-11-14T09:10:44Z · needs_input
- 2026-11-14T09:11:56Z · body: Desired UX (added); Acceptance criteria (added 7, removed 7); Notes for AI (added); Desired outcome (removed)
- 2026-11-14T09:17:06Z · title, body: Acceptance criteria (added 4, removed 2)
- 2026-11-14T09:17:07Z · body: Notes for AI (added 1, removed 1)
- 2026-11-14T09:22:33Z · needs_input
- 2026-11-14T11:03:51Z · cli_override, model_override
- 2026-11-14T11:03:53Z · status inbox→ready
- 2026-11-14T11:03:55Z · status ready→active, branch
- 2026-11-14T11:18:28Z · status active→review
