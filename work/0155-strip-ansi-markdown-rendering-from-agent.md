---
id: "0155"
title: Strip ANSI/markdown rendering from agent output before parsing
type: bug
status: review
needs_input: true
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: feat/strip-ansi-markdown-rendering-from-agent
created_at: "2026-08-13T06:15:56Z"
updated_at: "2026-08-13T11:16:14Z"
---
## Activity

- 2026-08-13T06:15:56Z · created · unknown


## Problem

`runPrompt` (`src/server/agents.ts`) captures a coding agent's raw stdout and hands it
straight to text parsers that expect plain output — `parseGeneratedTask` /
`explanationTitle` (`src/server/freeform.ts`) for `/api/tasks/freeform`, and
`parseGeneratedDocument` (`src/server/server.ts`) for `/api/docs/freeform`. Both
parsers look for a literal `---` frontmatter delimiter via `parseDocument`
(`src/core/frontmatter.ts`).

`kiro-cli chat --no-interactive` doesn't emit plain text: it markdown-renders its
response for terminal display — ANSI color/style escape codes, and (critically) it
draws markdown `---` thematic breaks as a Unicode box-drawing line (`━━━━━━━━`, not
literal dashes), wrapped in a `> ` blockquote marker. The frontmatter parser never
recognizes any `---`, so the entire rendered response — border, escape codes, and all
— gets treated as flat body text, and the first (garbage) line becomes the task/doc
title. This is exactly what happened to task #0154: a perfectly well-formed task
underneath, destroyed by kiro's rendering before it ever reached the parser.

This is not just a display glitch — it silently corrupts real content on disk (task
titles, doc bodies) with no error raised, so it can go unnoticed until someone reads
the created task/doc.

## Desired UX

Freeform task/doc creation through the kiro agent (or any other CLI that renders
rather than prints plain text) produces the same clean result as `claude code`/
`qwen code` do today — no visible escape codes or box-drawing artifacts in a created
task or doc, ever.

## Acceptance criteria

- [ ] `runPrompt`'s captured output has ANSI escape sequences stripped before it is
      returned/parsed (reuse or generalize the existing `stripAnsi` helper in
      `src/server/done.ts:243` rather than writing a second implementation).
- [ ] Investigate whether `kiro-cli chat` has a flag to disable markdown/box-drawing
      rendering in `--no-interactive` mode (e.g. a `--plain`/`--raw`/`--no-color`
      equivalent) and pass it from `promptCommand`/`reviewCommand`
      (`src/server/agents.ts`). If no such flag exists, make the frontmatter
      delimiter detection tolerant of a rendered horizontal rule (a line of
      box-drawing characters, optionally under a `> ` blockquote prefix) as a
      fallback — whichever is more robust.
- [ ] A freeform task or doc created via the kiro agent parses correctly: real title,
      real frontmatter fields (type/priority/area), clean body — verified against a
      real `kiro-cli` run, not just a synthetic fixture.
- [ ] Existing tests for `parseGeneratedTask`/`parseDocument`/`parseGeneratedDocument`
      still pass; add a regression test using the captured raw kiro output shape
      (ANSI codes + box-drawing rule + `> ` prefix) so this can't silently regress.

## Notes for AI

- Reference `work/0154-add-file-tree-navigation-and-refresh-bu.md`'s git history
  (commit `8a0d30c`) for the exact raw corrupted content this task is about — that's
  the real fixture to test against.
- `src/core/models.ts:235` already has a similar-but-not-identical ANSI-stripping
  regex (`\x1b\[[^m]*m` + `\x1b\[[?][0-9]*[a-zA-Z]`) for a different purpose (model
  probe output) — worth checking whether to consolidate into one shared utility
  instead of a third copy.
- Don't scope this to kiro only if the fix is generic (ANSI stripping) — apply it to
  all `runPrompt` output regardless of `cli`, since any driver could emit escape
  codes.

## Activity

- 2026-08-13T06:24:13Z · status inbox→ready
- 2026-08-13T06:24:16Z · status ready→active, branch
- 2026-08-13T09:46:05Z · watchdog: automatic resume attempted
- 2026-08-13T09:52:05Z · watchdog: escalated to needs_input · handoff signal was not detected after the automatic resume · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-13T11:16:14Z · status active→review
