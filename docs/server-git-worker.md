# Server Git worker (#0962)

`src/server/git-worker.ts` owns one child per repository and a serialized
request queue. `git-worker-entry.ts` runs the Git/index queries outside the
HTTP process. Deadlines include queue time; a running request that times out
kills its child process group. Late output, errors and close events from that
child must not affect its replacement.

Board facts use the batched ref/ahead-count and worktree queries in
`repoGitOverviewAsync`, plus the incremental directory-commit cache. Ref state
has no timer expiry. The work watcher invalidates it when Git metadata changes,
including shared refs and linked-worktree HEADs. A generation travels with each
request when dispatched, so invalidation cannot expire behind a cold history
walk. Results started before invalidation may answer their original caller but
must not repopulate the parent cache.

The default `GET /api/tasks` response is `{ tasks, nextCursor }`, with 100 rows
by default and a maximum limit of 500. Its default fields are `id`, `title`,
`status` and `priority`; Markdown bodies are excluded. `fields`, `status`,
`limit` and `cursor` select a page. `full=1` explicitly requests the legacy
array with bodies and enrichments, streamed in batches with event-loop yields.
`GET /api/tasks/:id/context` includes the task, dependency/dependent summaries,
related tasks, stored review verdict and branch/worktree facts. `repoos list`
uses the paged endpoint when the control plane is available and retains an
offline local-index fallback.

## Remaining verification and migration

A source-text check of server imports alone cannot prove that every request or
timer is free of blocking processes. In particular, an async function can call
a synchronous helper before its first await. A TypeScript call-graph audit on
2026-10-27 found remaining candidates through `mergeBranch` and
`syncBranchWithMain` in `done.ts`, check-store root resolution, inherited-env
linking in previews, service management, support-bundle collection, check-plan
changed-path resolution, process-group inspection, pressure probes and shared
browser-slot acquisition. These require following the actual runtime path;
context-pack supplied-facts fallbacks and CLI-only `refreshAll` paths also show
up in a conservative call graph but are not evidence of a server invocation.
Do not describe the existing text guard as a complete transitive process guard.

The one-hour responsiveness run with 900 tasks, 100 branches and two live
engineers has not been observed in this worktree. It needs a human-controlled
server rollout and recorded timings; finite fixture tests are not that proof.
