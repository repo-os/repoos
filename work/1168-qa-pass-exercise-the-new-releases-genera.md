---
id: "1168"
title: "QA pass: exercise the new Releases 'Generate AI notes and publish' flow and the update/restart modal end to end"
type: bug
status: ready
priority: p1
area: [web, server]
assigned_to: ai
created_by: t@t
branch: ""
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-18T00:17:51Z"
updated_at: "2026-11-18T00:17:56Z"
---
## Problem

#1126 (Generate AI notes and publish) and #1154 (restart modal for a hand-run server) shipped after many review rounds but nobody has driven them like a user, and both are outward-facing (publishing a release, restarting the server).

## Desired UX

In a throwaway task-worktree dev server (never the served checkout), the Releases cut panel opens, the chooser appears, both choices behave as described, cancel works, a failed draft publishes nothing, and the update modal shows a real Restart now action for a hand-run server and a correct command otherwise.

## Acceptance criteria

- [ ] Run the app with just serve-noauth from a scratch worktree on a spare port and drive it with Playwright or a browser: open Releases, open the cut panel, click Generate AI release notes, check the modal wording for both choices (Notify must never say it will publish), pick each, cancel a pending one, and reload during a pending one; use a fake agent or the test seams so no real release is cut and nothing is pushed or tagged.
- [ ] Render the update/restart notice in each supervisor state (hand-run, launchd, systemd) using the existing test fixtures; look at every screenshot yourself at 1440 and 390 widths in light and dark.
- [ ] Record every defect; fix small clear ones with a test each; file larger ones as tasks with the screenshot attached. No screen is reported without a screenshot.
- [ ] Never cut or publish a release, never restart the real server, and never touch the served checkout.

## Notes for AI

Do not edit repoos.toml.

## Activity

- 2026-11-18T00:17:51Z · created · t@t
- 2026-11-18T00:17:54Z · cli_override, model_override
- 2026-11-18T00:17:56Z · status inbox→ready
