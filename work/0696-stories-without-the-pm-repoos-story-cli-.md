---
id: "0696"
title: "Stories without the PM: `repoos story` CLI and an API create that writes exactly what it is given"
type: feature
status: ready
priority: p2
area: [cli, server]
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-06T03:15:42Z"
updated_at: "2026-10-07T18:06:11Z"
---
## Problem

An agent (or script) cannot create a story deterministically. The only create path is `POST /api/stories/freeform` (the UI's New story), which always starts the PM agent afterwards: the PM rewrites the body (a 1,250-byte brief came back as a much longer page with new sections) and tags every untagged non-draft task it thinks belongs. There is no CLI at all (`repoos --help` lists no story command), and hand-writing `stories/*.md` bypasses the commit and numbering path. The tuk-private driver had to tag existing tasks first and create stories one at a time to keep the PM from re-tagging work.

## Desired UX

`repoos story new "<name>" --body <text|->` writes and commits the story exactly as given, prints its number and path, and starts no agent. `repoos story list`, `repoos story show <number|name>` and `repoos story update <number|name> --body/--name` cover the rest. The UI keeps its current PM flesh-out by default.

## Acceptance criteria

- [ ] `POST /api/stories` (or `POST /api/stories/freeform` with `pm: false`) writes and commits the definition via `writeStoryDefinition` + the existing commit path, returns the definition, and starts no PM run and no task tagging. Name collisions return 409 as today.
- [ ] A `PATCH /api/stories/:key` (or equivalent) updates name/body without the PM, keeping the stable number (rename keeps the number, as the PM rename does).
- [ ] CLI: `repoos story new|list|show|update`, board-rooted like `repoos new` (works from a worktree), committing like task writes; `--body -` reads stdin; `--json` on list/show.
- [ ] `repoos new/update --story` keep working; `repoos story show` lists member tasks with status.
- [ ] Help text, `user-docs/cli.md` and the Stories section of `user-docs/configuration.md` document both paths (PM flesh-out in the UI, verbatim via CLI/API).
- [ ] Tests: CLI create/update/list round-trip in a temp repo; API create with `pm: false` asserts no PM run was started; tag-only stories unaffected.

## Notes for AI

Evidence: `~/code/tuk/tuk-private/repoos/docs/repoos-feedback.md` (tuk-private run, 2026-10-06), item 5.

Code: `src/server/routes/stories.ts` (`createFreeformStory`), `src/core/story-definition-files.ts` (`writeStoryDefinition`, `rewriteStoryDefinition`), `src/commands/tasks.ts` for CLI patterns (`NEW_FLAGS`/`UPDATE_FLAGS`), `src/cli/` for command registration.

## Activity

- 2026-10-06T03:15:42Z · created · unknown
- 2026-10-07T18:06:11Z · status inbox→ready
