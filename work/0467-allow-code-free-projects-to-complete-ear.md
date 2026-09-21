---
id: "0467"
title: Allow code-free projects to complete early bootstrap tasks
type: bug
status: inbox
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: codex/bootstrap-aware-mtd
created_at: "2026-09-21T11:12:25Z"
updated_at: "2026-09-21T11:13:24Z"
---
Move-to-done must not require bun run build before a project has code or a declared build step. In the bootstrap phase, preserve Git-safety checks and run any explicitly declared check plan; add regression coverage for docs/config/scripts scaffolding in a package-less repo.

## Activity

- 2026-09-21T11:12:25Z · created · unknown
- 2026-09-21T11:13:24Z · branch
