---
id: "1109"
title: "repoos restart: restart a hand-started server, or say clearly why it cannot"
type: feature
status: review
priority: p3
area: [server, cli]
assigned_to: ai
created_by: t@t
branch: feat/repoos-restart-restart-a-hand-started-se
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T08:27:36Z"
updated_at: "2026-11-14T08:43:58Z"
---
## Problem
`repoos restart` refused to restart a server that was started by hand with `just serve` (nohup, parented by pid 1): "pid has no row in launchctl list but is parented by pid 1 — it may be an externally supervised server, but its launchd label could not be determined", then suggested killing it manually. #1091 was meant to restart the running server "whether hand-run, supervised or a managed service". A nohup-started server is hand-run, so the human had to kill and respawn it themselves.

## Desired UX
For a hand-started server (no launchd/systemd owner), `repoos restart` stops it and starts a replacement with the same command line, working directory and port, then confirms the new version over /api/health. When ownership genuinely cannot be determined, the message says what was checked and gives one exact command to run. Never restart while engineers or checks are running unless `--force`.

## Acceptance criteria
1. Reproduce: start `repoos serve` with nohup, run `repoos restart`; record the current behaviour.
2. A hand-started server restarts with its original arguments and the same port, and the command reports old and new versions.
3. Supervised servers (launchd, systemd) behave exactly as before.
4. If the process has no recoverable command line, the failure message lists what was tried and one copy-paste command.
5. Tests with a fake process table; docs in user-docs/cli.md updated.

## Notes for AI
Start from the #1091 restart implementation and `src/core/supervisor-detect.ts`. Do not kill any process you did not verify is a RepoOS server for this project root.

## Activity

- 2026-11-14T08:27:36Z · created · t@t
- 2026-11-14T08:28:03Z · cli_override, model_override
- 2026-11-14T08:28:05Z · status inbox→ready
- 2026-11-14T08:28:06Z · status ready→active, branch
- 2026-11-14T08:35:09Z · body
- 2026-11-14T08:42:58Z · body
- 2026-11-14T08:43:46Z · CTO nudge: held — handoff gate is running
- 2026-11-14T08:43:58Z · status active→review
- 2026-11-14T08:43:58Z · message_queued at 2026-11-14T08:43:58.348Z
- 2026-11-14T08:43:58Z · note: shots: skipped — Docs site skipped: no docs shot declared
