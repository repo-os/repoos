---
id: "1161"
title: "Easter eggs bundle: numeric enum settings reject real integers (maxConcurrentAgents)"
type: feature
status: review
priority: p3
area: server
assigned_to: ai
created_by: t@t
branch: feat/easter-eggs-bundle-numeric-enum-settings
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T17:09:11Z"
updated_at: "2026-11-18T00:33:08Z"
---
## Problem
`repoos config set maxConcurrentAgents 4` (and `repoos api PATCH /api/config --json '{"maxConcurrentAgents":4}'`) fail with "Maximum concurrent agent processes must be one of: 1, 2, ..., 16" even though 4 is in the list. Sending the value as a string works: `--json '{"maxConcurrentAgents":"4"}'` returns 200 and writes `maxConcurrentAgents = 4`. So the validator compares a number against a list of strings (or the enum is typed as strings) and rejects real integers, while the schema/settings UI describe it as a number.

## Acceptance criteria
- `repoos config set maxConcurrentAgents 4` and a JSON number both succeed and persist as an integer in `repoos.toml`
- String "4" still works (coerce)
- Audit other enum-of-number settings in `getConfigSchema()` for the same mismatch; test table-driven
- Test that the config API accepts integer and string forms for numeric enum settings

## Notes for AI
Found on 2026-11-18 while capping engineers on the Tiao project. Small independent fix; bundle with other easter eggs if an open bundle exists.

## Activity

- 2026-11-17T17:09:11Z · created · t@t
- 2026-11-18T00:17:44Z · cli_override, model_override
- 2026-11-18T00:17:46Z · status inbox→ready
- 2026-11-18T00:17:47Z · status ready→active, branch
- 2026-11-18T00:24:02Z · body
- 2026-11-18T00:30:26Z · message_queued at 2026-11-18T00:30:26.220Z
- 2026-11-18T00:30:26Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-18T00:30:44Z · body
- 2026-11-18T00:33:08Z · status active→review
- 2026-11-18T00:33:08Z · message_queued at 2026-11-18T00:33:08.698Z
