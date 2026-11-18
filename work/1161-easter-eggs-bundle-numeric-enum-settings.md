---
id: "1161"
title: "Easter eggs bundle: numeric enum settings reject real integers (maxConcurrentAgents)"
type: feature
status: inbox
priority: p3
area: server
assigned_to: ai
created_by: t@t
branch: ""
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T17:09:11Z"
updated_at: "2026-11-18T00:17:44Z"
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
