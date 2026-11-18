---
id: "1177"
title: "QA pass: RepoOS CLI usability – help text, error messages and exit codes"
type: bug
status: active
priority: p2
area: core
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-repoos-cli-usability-help-text-e
created_at: "2026-11-18T05:56:48Z"
updated_at: "2026-11-18T05:57:02Z"
---
## Problem
CLI commands (list, show, new, update, start, mv, done, review, handoff-status, upgrade, restart) may have unclear help or errors.
## Desired UX
Every command has accurate --help, errors say what to do next, exit codes are right.
## Acceptance criteria
- Run each command with bad input and --help in a scratch worktree/repo; fix unclear or wrong output with tests.
- Commit docs/qa/2026-11-cli-usability.md with findings.
## Notes for AI
Do not touch repoos.toml; do not run commands that mutate the real board.

## Activity

- 2026-11-18T05:56:48Z · created · t@t
- 2026-11-18T05:56:59Z · status inbox→ready
- 2026-11-18T05:57:02Z · status ready→active, branch
