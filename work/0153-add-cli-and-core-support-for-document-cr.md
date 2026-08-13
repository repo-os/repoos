---
id: "0153"
title: Add CLI and core support for document creation
type: feature
status: ready
priority: p3
area: cli
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-13T05:34:11Z"
updated_at: "2026-08-13T13:06:50Z"
---
## Activity

- 2026-08-13T05:34:11Z · created · unknown


## Problem

Task creation has a full stack: `createTask` lives in core (`src/core/repoos.ts`) and is
exposed both over HTTP (`POST /api/tasks`, `/api/tasks/freeform`) and via the CLI
(`repoos new` / `repoos add`, in `src/commands/tasks.ts`).

Document creation has no such core function and no CLI command. The write logic
(`mkdirSync` + `writeFileSync`) is inlined directly in two `server.ts` route handlers
(`/api/docs/create` and `/api/docs/freeform`, around line 1344 and 1362). The only way
to create a doc today is through the web UI's "New doc" panel — there's no
`repoos new-doc` or similar, and nothing in `src/commands/` touches docs at all.

## Desired UX

Mirror the task pattern:

- A core `createDocument` (manual: path + content) and `createFreeformDocument`
  (description → PM agent → path + content) function, likely in a new
  `src/core/docs.ts`, alongside `core/repoos.ts`'s `createTask`.
- `server.ts`'s `/api/docs/create` and `/api/docs/freeform` routes call into the new
  core functions instead of inlining the write.
- A new CLI command, e.g. `repoos new-doc "<description>"` (freeform, PM-agent-backed)
  and/or `repoos new-doc --path docs/foo.md --content-file x.md` (manual), following
  the flag conventions in `cmdNew` (`src/commands/tasks.ts:167`).

## Acceptance criteria

- [ ] `createDocument` and `createFreeformDocument` exist in core, not inlined in
      `server.ts`.
- [ ] `/api/docs/create` and `/api/docs/freeform` are thin wrappers over the core
      functions; existing behavior (incl. the frontmatter-based freeform format —
      see Notes) is unchanged.
- [ ] A new `repoos` CLI command creates a document, both freeform and manual, and
      prints the created path (matching `cmdNew`'s output style).
- [ ] The generated/given path is validated to stay under `config.docsDir` (or another
      explicit allowlist) — see the constraint below.

## Notes for AI

- The freeform doc-generation prompt asks the PM agent for a frontmatter `path:` field
  + literal markdown body (parsed via `parseDocument` from `core/frontmatter.ts`) —
  this replaced an earlier strict-JSON format that was fragile for the model to
  produce. Keep that format; don't revert to JSON.
- **Known gap to close in this task:** neither the manual nor freeform doc path is
  currently validated against `config.docsDir`. During manual testing the PM agent
  once wrote to `work/0153-....md` instead of `docs/`, and since `work/` is the task
  directory, RepoOS's live index picked it up as a bogus task on the board. Add a
  path check (e.g. reject/normalize any generated path outside `config.docsDir`) as
  part of this work, in both the new core function and wherever the CLI accepts a
  manual `--path`.
- Reuse `resolvePmAgent` / `runPrompt` from `server/agents.ts` for the freeform path,
  same as the existing route.

## Activity

- 2026-08-13T13:06:50Z · status inbox→ready
