---
id: "1100"
title: Linux service install omits PATH so agent CLIs fail with spawn ENOENT
type: bug
status: active
priority: p1
area: core
assigned_to: ai
created_by: t@t
branch: feat/linux-service-install-omits-path-so-agen
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-13T01:24:51Z"
updated_at: "2026-11-13T02:49:32Z"
---
## Problem

On Linux, `repoos service install` wrote a systemd user unit with no `Environment=PATH=`, so the service ran with the systemd default PATH (mise shims, /usr/bin). Agent CLIs installed in `~/.local/bin` (codex, copilot) were not found: every engineer and the CTO failed with `spawn codex ENOENT`, `dev_error_count` reached 48 in about 30 minutes, and the task showed `needs_input: dev-error` with empty agent logs. Seen 2026-11-13 on the laisen project (ThinkPad, unit `com.repoos.serve.laisen-4e0a7ad7`). The older neung unit on the same host did have a PATH line. Fix applied by hand with a drop-in `Environment=PATH=...`.

## Acceptance criteria

- `repoos service install` on Linux records the installing shell's PATH (or at least `~/.local/bin`, the node and bun dirs) in the unit, and refuses with a clear message if a configured agent CLI cannot be found on the resulting PATH.
- A spawn ENOENT for an agent CLI produces a visible error on the task (names the CLI and the PATH searched) instead of silent empty logs.
- Test: generated unit text contains the PATH line; ENOENT classification test.

## Notes for AI

Look at the service install code that writes the systemd unit and the engineer launch error handling that records `dev-error`. Do not widen scope to macOS launchd unless it has the same gap (check and note).

## Activity

- 2026-11-13T01:24:51Z · created · t@t
- 2026-11-13T02:49:29Z · cli_override, model_override
- 2026-11-13T02:49:31Z · status inbox→ready
- 2026-11-13T02:49:32Z · status ready→active, branch
