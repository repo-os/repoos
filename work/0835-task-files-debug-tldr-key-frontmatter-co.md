---
last_close_out_gate_ms: 149071
last_close_out_gate_at: "2026-10-18T13:01:11.563Z"
id: "0835"
title: "Task files: debug_tldr_key frontmatter contains a NUL byte (git treats the task file as binary)"
type: bug
status: review
priority: p3
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/task-files-debug-tldr-key-frontmatter-co
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T11:29:52Z"
updated_at: "2026-10-18T13:01:11Z"
review_passes: 1
---
## Problem
RepoOS writes `debug_tldr_key: "dev-error<NUL>RetriableError: …"` into task frontmatter (seen 2026-10-18 on #0829 and #0834, one NUL byte each). A NUL byte in a tracked markdown file makes git and grep treat it as **binary**: `grep` prints "Binary file … matches" instead of lines, `git diff` shows "Binary files differ", and a merge conflict in the task file becomes a binary conflict that cannot be auto-resolved by taking main's copy as text. Today it made my status greps return garbage for two tasks.

## Desired UX
No NUL (or any control character) is ever written into a task file. The key joins its parts with a visible separator (for example `|` or a space), and existing task files that already contain the NUL are repaired on write/read (one-time, idempotent).

## Acceptance criteria
- Test: building/writing a debug_tldr key never emits a control character; the written file is valid UTF-8 text with no `\0`.
- Test: a task file that already contains a NUL in `debug_tldr_key` is rewritten without it on the next patch, and the parse of the key is unchanged semantically.
- Test: a tracked task file with that key is treated as text by `git diff` (no "Binary files").
- Search for other writers of control characters into frontmatter.

## Notes for AI
Find where `debug_tldr_key` is built (grep `debug_tldr`). Do not hand-edit work/*.md; use RepoOS paths. Source: driver observation 2026-10-18.

## Activity

- 2026-10-18T11:29:52Z · created · njachowski@gmail.com
- 2026-10-18T12:23:46Z · status inbox→ready
- 2026-10-18T12:23:49Z · cli_override, model_override
- 2026-10-18T12:23:50Z · status ready→active, branch
- 2026-10-18T12:26:07Z · body
- 2026-10-18T12:26:51Z · body
- 2026-10-18T12:51:21Z · status active→review
- 2026-10-18T12:51:22Z · note: shots: skipped — the diff (5 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-18T12:52:02Z · note: review pass 1: good to go
- 2026-10-18T13:01:11Z · close-out gate completed in 149s

