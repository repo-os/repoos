---
updated_at: "2026-11-18T05:53:33Z"
review_passes: 1
id: "1176"
title: "QA pass: user-docs accuracy for Hub apps, Releases and remote runners vs current behavior"
type: chore
status: review
priority: p2
area: docs
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-user-docs-accuracy-for-hub-apps-
created_at: "2026-11-18T05:49:21Z"
---
## Problem
Many Hub, Releases and runner changes landed in v0.5.90; user-docs may describe old behavior.
## Desired UX
user-docs/ matches what the app and CLI do now.
## Acceptance criteria
- Check user-docs pages for macOS Hub, Android Hub, tailnet discovery, releases and update/restart, remote runners and per-project check settings against the code.
- Fix stale or wrong statements; commit docs/qa/2026-11-user-docs-accuracy.md listing what changed.
## Notes for AI
Docs only unless a doc reveals a real bug (then file a note in the QA record). Do not touch repoos.toml.

## Activity

- 2026-11-18T05:49:21Z · created · t@t
- 2026-11-18T05:49:26Z · status inbox→ready
- 2026-11-18T05:49:29Z · status ready→active, branch
- 2026-11-18T05:52:12Z · CTO nudge: held — handoff gate is running
- 2026-11-18T05:53:04Z · status active→review
- 2026-11-18T05:53:05Z · message_queued at 2026-11-18T05:53:05.010Z
- 2026-11-18T05:53:05Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-18T05:53:33Z · note: review pass 1: good to go

