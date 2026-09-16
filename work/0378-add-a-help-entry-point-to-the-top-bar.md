---
id: "0378"
title: "Add a Help (\"?\") entry point to the top bar"
type: feature
status: draft
priority: p2
area: general
assigned_to: ""
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-16T17:09:45Z"
updated_at: "2026-09-16T17:09:45Z"
---
Add a Help ("?") entry point to the top bar

Early users have nowhere to go when they're stuck — no "Help" affordance exists in the app today. Add a small "?" icon/button to the top bar (visible on every screen, not just a nav item) that opens a lightweight menu linking to:

Docs (user-docs/, wherever they're published)
GitHub Discussions (now enabled on repo-os/repoos) — for questions
GitHub Issues (now enabled) — for bugs

Keep it minimal for v1: a small dropdown/popover with 2-3 links, no in-app help center. Should follow the existing icon style used in nav.ts (inline SVG, currentColor, 1.8 stroke-width). Not a nav.ts entry — this lives in the top bar/header component, separate from the main Control/Inputs/Work/Agents/Context/Settings nav so it doesn't compete for space there.

## Original prompt

Add a Help ("?") entry point to the top bar

Early users have nowhere to go when they're stuck — no "Help" affordance exists in the app today. Add a small "?" icon/button to the top bar (visible on every screen, not just a nav item) that opens a lightweight menu linking to:

Docs (user-docs/, wherever they're published)
GitHub Discussions (now enabled on repo-os/repoos) — for questions
GitHub Issues (now enabled) — for bugs

Keep it minimal for v1: a small dropdown/popover with 2-3 links, no in-app help center. Should follow the existing icon style used in nav.ts (inline SVG, currentColor, 1.8 stroke-width). Not a nav.ts entry — this lives in the top bar/header component, separate from the main Control/Inputs/Work/Agents/Context/Settings nav so it doesn't compete for space there.

## Activity

- 2026-09-16T17:09:45Z · created · hello@repoos.org
