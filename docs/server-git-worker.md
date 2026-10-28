# Server Git worker (#0962)

`src/server/git-worker.ts` owns two lazy children per repository: a bulk lane
for overview/index/history/task/dependency reads and a fast lane for short Git
commands, context facts and small diff reads. Each lane serializes its own jobs;
a bulk scan or timeout cannot block or kill the fast child. Generic Git commands
share the fast lane, so a caller-supplied long command can still queue other
commands in that lane. `git-worker-entry.ts` runs the queries outside the HTTP
process. A job's run deadline starts at dispatch; queue wait is capped separately
at three minutes. A running timeout kills only that lane's child process group.
Late events from that child cannot affect its replacement. STUCK request logs
include each job's lane, `queueWaitMs` and `runMs` alongside its current age.

Successful directory-history walks are atomically saved under
`.repoos/cache/dir-log-<directory hash>.json`, including their HEAD and a format
version. The cache directory ignores its generated files even in repositories
without RepoOS ignore rules. A replacement child loads the saved result: equal HEAD needs no walk,
a descendant needs only the incremental range, and a rewritten HEAD requires a
full walk. Failed walks never replace a good saved cache; corrupt, missing or
incompatible files are cache misses. Full walks are pinned to the sampled HEAD
so concurrent commits cannot poison the cache's identity.

Commit-graph maintenance runs asynchronously in the parent, independently of
both queues. It checks at startup and every five minutes, and debounces observed
Git mutations for five seconds. Missing graphs, changed HEADs and graphs older
than one hour trigger `git commit-graph write --reachable --changed-paths --split`.
The successful HEAD/time marker lives beside the graph in Git's objects/info,
shared by linked worktrees. Failures warn and retry on a later tick; they do not
fail board requests or server startup. Closing the worker cancels future ticks.
The boot index build retains its three-attempt retry.
`repoos stats` lists each in-flight git job per lane with its queue wait and
run time (via `/api/system`'s `gitJobs`), and the STUCK request log appends the
same list. A check that waits — pressure guard, heavy slot, git queue — is
surfaced on the task card and in the run record; past ten minutes the watchdog
escalates it to `needs_input` (#0974, `user-docs/check.md`).

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

The scope of #0962 was narrowed on 2026-10-27 to the worker boundary for migrated
calls, the paged Tasks API, and the asynchronous lifecycle regressions. Remaining
blocking calls and the transitive guard belong to #0965; board query batching and
cache coverage to #0966 (partially covered by #0974's durable directory cache; route/spawn-count verification remains); request-duration/STUCK diagnostics to #0967; reload
handover to #0968; and the one-hour latency measurement to #0969.

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

Confirmed remaining paths include `patchTaskFile` in `server/write.ts` calling
`commitTaskFile` → `commitFiles` → synchronous Git status/add/commit, and
`AgentRunner.healBoardDivergence` calling synchronous `fileCommittedClean`.
Process-group inspection also shells out synchronously through
`core/process-group.ts`. These are outside the current guard's helper list;
passing that guard does not establish the absence of blocking server calls. Session loading and the dependency
validation fallback now use a metadata-only index, so those two reads no
longer need synchronous Git enrichment.

The one-hour responsiveness run with 900 tasks, 100 branches and two live
engineers has not been observed in this worktree. It needs a human-controlled
server rollout and recorded timings; finite fixture tests are not that proof.
