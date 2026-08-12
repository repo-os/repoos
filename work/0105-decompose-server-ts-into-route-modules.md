---
id: "0105"
title: Decompose server.ts into route modules
type: chore
status: active
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: feat/decompose-server-ts-into-route-modules
created_at: "2026-08-11T14:00:00Z"
updated_at: "2026-08-12T19:38:03Z"
---
## Problem

`src/server/server.ts` is 1,431 lines — the single largest file in the codebase.
It handles HTTP routing, config validation (116 lines inline), SSE, PWA
manifest rendering, static UI serving, task CRUD, agent lifecycle, model
probing, move-to-done, preview management, and auto-reload bootstrap. Every
change to any route touches this file. It's a merge-conflict magnet and
resists parallel work.

## Desired UX

No user-visible change. `repoos serve` starts and behaves identically. The
difference is purely internal: route handlers live in dedicated modules under
`src/server/routes/`, and `server.ts` is reduced to HTTP bootstrap + router
setup.

## Acceptance criteria

- [ ] Route handlers extracted to `src/server/routes/`:
      - `src/server/routes/tasks.ts` — task CRUD, freeform, done, sync
      - `src/server/routes/agents.ts` — agent start, pause, message, output, running
      - `src/server/routes/config.ts` — config read/write PATCH
      - `src/server/routes/models.ts` — model list, model test
      - `src/server/routes/ui.ts` — static assets, manifest, favicon
- [ ] `src/server/server.ts` shrinks to ~200-300 lines (bootstrap, router,
      SSE, auto-reload, health endpoint)
- [ ] A simple router helper replaces the nested-if chain (e.g. `route("POST",
      "/api/tasks/:id/start", handlers.startTask)`)
- [ ] No behavior changes — every existing API test passes without modification
- [ ] `repoos check` passes (build + tests + UI smoke)
- [ ] No new dependencies added

## Notes for AI

- This is a mechanical refactor. Do NOT change any logic, error messages,
  response shapes, or route paths. Move code, don't rewrite it.
- The existing handler functions are `async (req, res) => void` closures
  that capture `config`, `index`, `runner`, `previews`, etc. via the
  `startServer` scope. Extract them into named functions that accept these
  as parameters (or a shared context object).
- The router pattern can be very simple — a `Map<string, Handler>` keyed on
  `"METHOD /path"` with a small param-extraction helper for `:id` segments.
  No need for a library.
- Verify after extraction: run the full test suite (`vitest run`). If any
  test fails, you changed something you shouldn't have.
- Do not touch `agents.ts`, `done.ts`, `live-index.ts`, or any other file
  unless a handler's import path changed.
- Grep for `startServer` references in tests to ensure the signature hasn't
  changed.

## Activity

- 2026-08-12T18:42:43Z · status ready→active, branch
