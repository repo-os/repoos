---
id: "0008"
title: "Fix path handling on Windows (drive letters, backslashes)"
type: bug
status: done
priority: p0
area: core
assigned_to: ai
created_by: ""
branch: "feat/0008-win-paths"
created_at: "2026-08-01T09:00:00Z"
updated_at: "2026-08-04T18:00:00Z"
---
## Activity

- 2026-08-01T09:00:00Z · created · unknown
- 2026-08-04T18:00:00Z · set status done · unknown

## Problem

Watch paths and safe-repo-file guards assumed POSIX separators, so `C:\repo`
roots broke indexing and file serving.

## Desired UX

- Tasks resolve and files serve correctly on Windows drive-letter roots.
- All path joins go through `node:path` — no string concatenation.
