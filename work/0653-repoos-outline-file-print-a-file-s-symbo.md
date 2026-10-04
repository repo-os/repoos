---
id: "0653"
title: "repoos outline <file>: print a file's symbols with line numbers so agents read ranges, not whole files"
type: feature
status: inbox
priority: medium
area: core
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-10-04T16:36:26Z"
updated_at: "2026-10-04T16:36:26Z"
---
## Problem
Engineer agents re-read files constantly (analysis of 234 engineer sessions, 2026-10-05): 38% of reads (1,004 of 2,647) were of a file already read in the same session, about 4.2MB re-read. Hot files: TaskDrawer.vue 167 reads, agents.ts 120, server.ts 94, style.css 92, stores/repo.ts 76, config.ts 64. Reads average 5.8KB of output (the largest per-call average of any tool), usually 200-400 line windows, and all of it stays in context and is re-billed as cache reads on every later turn. Agents have no cheap way to learn a file's structure, so they read a big window to find the part they want.

## Desired UX
repoos outline <file> prints a compact map of the file: exported/top-level functions, classes, types, constants and (for .vue) the template/script/style line ranges, each with start-end line numbers. An agent calls it once, then reads only the range it needs. Output for agents.ts should be a few hundred lines at most, ideally far fewer.

## Acceptance criteria
- repoos outline <path> supports .ts/.tsx/.js/.mjs, .vue (SFC block ranges plus script symbols) and .css (sections or top-level selectors); unsupported types print a clear one-line message, not an error dump.
- Output is plain text, stable and greppable: kind, name, start-end lines. A --json flag is optional.
- Zero runtime dependencies: use the TypeScript compiler API already in devDependencies only if it is available at runtime for the CLI; otherwise a regex/line-scanner fallback. Say which was chosen and why (hard constraint: no new runtime dependency).
- Fast: under 200ms for the largest file in the repo.
- AGENTS.md (this repo) and the repoos init template in src/commands/init.ts get a short note telling agents to run it before reading large files; keep the template change deliberate.
- Tests cover each file type, nested/exported symbols and the unsupported case.

## Notes for AI
Success metric: re-read rate in sessions after this ships versus the 38% baseline, and the share of read calls with offset/limit ranges. Not a duplicate of the context-pack ranking work (which ranks likely files); this is per-file structure. Check whether pi/opencode can expose it as a custom tool or MCP server later; the CLI plus an AGENTS.md note is the first step.

## Activity

- 2026-10-04T16:36:26Z · created · unknown
