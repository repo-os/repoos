---
id: "0763"
title: "Let the CLI and API attach screenshots when an agent creates or updates a task, and tell agents to do it"
type: feature
status: active
priority: p2
area: [cli, server, docs]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/let-the-cli-and-api-attach-screenshots-w
created_at: "2026-10-13T09:13:55Z"
updated_at: "2026-10-13T09:22:28Z"
---
## Problem
A human often gives an agent screenshots in chat and says 'create a task for this'. An agent driving RepoOS through the CLI cannot attach those images: repoos new/update have no attachment option, so the agent either drops the screenshots (the engineer and reviewer then guess at the visual problem and loop for hours) or hand-copies files into work/.attachments/<id>/ and edits the task's ## Screenshots section by guesswork. The server already stores task screenshots (POST /api/tasks/:id/attachments { name, mime, data base64 }, gitignored work/.attachments/<id>/, ## Screenshots section with ![name](/api/tasks/<id>/attachments/<file>)), but only the UI New-task panel uses it. Observed in the Divot repo (#0083, #0084): the maintainer had to ask twice for the screenshots to be included.

## Desired UX
- repoos new and repoos update accept one or more local image files: for example repoos new "title" --screenshot path1.png --screenshot path2.png (repeatable) and repoos update <id> --screenshot path.png [--caption "..."].
- The command uploads through the existing attachment storage, assigns the numbered names, writes or extends the task's ## Screenshots section (before Activity), keeps the images gitignored, and prints the resulting attachment URLs.
- The API route for creating a task accepts attachments in the same request (or the CLI performs the create then the uploads atomically enough that a failed upload is reported, not silent).
- AGENTS.md guidance for agents is part of the product: the template that repoos init scaffolds (src/commands/init.ts) and this repo's own AGENTS.md tell any agent that creates a task from a message that included screenshots to attach every one of them with --screenshot, never to git add them, and to say in its reply which were attached. Also add the rule to the PM agent instructions so PM-created tasks carry the human's images.

## Acceptance criteria
- CLI: --screenshot (repeatable) on new and update, with validation (existing mime allowlist and size limit, clear error for a missing file), and documented in repoos help and user-docs/cli.md.
- Works against a running server using the CLI's existing one-shot auth; works when the server is the loopback instance.
- Images land in work/.attachments/<id>/ (gitignored); the task-asset guard still fails on any tracked image; the task file only gains the ## Screenshots markdown.
- Tests: create with 2 images, update adding a third (numbering continues), bad mime, oversize, missing file, section placement before Activity, and that nothing under work/ is staged by the command.
- init template and this repo's AGENTS.md updated with the rule; user-docs updated; the PM agent instructions mention it.
- Zero runtime dependencies; Bun-first conventions.

## Notes for AI
Reuse src/server/attachments.ts (saveScreenshot, sanitizeName, SCREENSHOTS_HEADING) and the existing POST /api/tasks/:id/attachments route; do not duplicate storage logic. The AGENTS.md template in src/commands/init.ts is a string literal and is NOT this repo's AGENTS.md: change both deliberately.

## Activity

- 2026-10-13T09:13:55Z · created · njachowski@gmail.com
- 2026-10-13T09:22:19Z · status inbox→ready
- 2026-10-13T09:22:28Z · status ready→active, branch
