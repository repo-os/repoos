# Onboarding: what `repoos init` leaves on the board

`repoos init` scaffolds RepoOS files, `AGENTS.md`, `repoos.toml` and a
`.gitignore` entry. By default everything goes under a `repoos/` subdirectory
(e.g. `repoos/work/`, `repoos/docs/`); the interactive prompt lets you choose
a different location or `/` for the repo root. `repoos.toml` and `AGENTS.md`
always stay at the root regardless of the layout choice.

It also seeds the first tasks, and the choice of *which* tasks is deliberate:
a brand-new project and an existing codebase start from different information,
so they get different starter tasks.

## Task 0001 is `done`, on purpose

`repoos/work/0001-set-up-repoos.md` (or `work/0001-set-up-repoos.md` with the
root layout) was scaffolded `status: ready` historically, which was misleading
— running `repoos init` already satisfies everything in it, so there was never
anything to "work". It is now scaffolded `done`, which left the `ready` column
empty immediately after init (task #0364). 0001 still exists as a worked example
of the task-file shape, and its `## Overview` carries the one-line project
description collected during the guided flow.

## The starter task (tasks #0364, #0671)

Because 0001 is done, `repoos init` also writes one starter task (id 0002 on a
fresh board; the helper scans the work directory and takes the next free 4-digit
id, matching `createTask`).

**#0671 revised #0364's decisions.** #0364 seeded the starter `status: ready` so
the Ready column was not empty after init. In practice that let anything which
auto-starts ready tasks (`autoEngineeringMode`, a driver script, a person
skimming "Ready") pick up a *suggestion* immediately — and, on the wrong
starter, waste a run and pollute the docs. A seeded starter is advice for the
human, so it now lands in `inbox` (never `ready`), and the init summary tells
the user to promote it. The starter also carries `created_by: repoos-init`
(previously `human`) so it can be filtered and archived once a real backlog
exists (#0657), and `repoos doctor` warns when one lingers unpromoted.

Which starter is seeded now follows the **repo's content** for the
non-guided path, not just the code path:

| Path | Seeded task | Why |
| --- | --- | --- |
| Guided new-project flow (not a git repo) | "Flesh out the product vision and initial architecture" | There's a one-line description but no code. The task embeds the description and carries the questions (audience, first release, stack, out-of-scope) that turn it into docs content and a real backlog. |
| Existing repo with meaningful source inside a git repo | "Read this codebase and propose docs/ + an initial task backlog" | There's a codebase to read. The task asks for real architecture/convention notes from what the code actually does, plus concrete follow-on tasks. |
| Existing repo that is effectively empty (no meaningful source — a fresh `git init`, a README-only repo, or only RepoOS's own scaffold) | "Flesh out the product vision and initial architecture" | There is nothing to read yet, so the read-the-codebase starter would only invite invented documentation. |

`detectMeaningfulRepoContent` (`src/commands/init.ts`) walks the tree, ignoring
RepoOS's own scaffold (`work/`, `docs/`, `.repoos/`, the namespaced `repoos/`),
`.git`, `.gitignore`, README/LICENSE and friends, empty directories, and heavy
generated dirs (`node_modules`, `dist`, …). Its pure core,
`repoHasMeaningfulContent`/`isMeaningfulRepoPath`, is unit-tested. Override the
choice with `repoos init --starter vision|codebase`; the guided new-project flow
always seeds the vision starter.

Both bodies are self-contained prompts and both are workable by a human alone —
RepoOS supports human-only usage, and `repoos init` runs before any server or
agent exists, so a task cannot assume one will be there to pick it up. The
starter is a static file written at scaffold time (the same `ensureFile`
mechanism as 0001), not an HTTP/PM call. The read-the-codebase body opens by
telling the reader to use the product-vision task instead if the repo turns out
to be empty.

## How did the "squishy" backlog actually get created? (investigation)

A real 2026-09-15 guided run of project "squishy" ended up with a PM-authored
task 0002 and concrete scaffold tasks 0003–0011. That outcome was **organic,
not automatic**. The 0002 title in that run ("please read the project
description, it m…") is the tell: it is the shape of a freeform prompt a human
(or agent) typed into the running server, not something init generates.

Evidence, checked before designing anything:

- **`autoEngineeringMode` defaults to `false`** (`src/core/config.ts`, shipped
  `repoos.toml`). And at this revision its only consumer,
  `AutoEngineeringOrchestrator` (`src/server/auto-engineering.ts`), is
  orphaned: no `src/server/*` module imports it, there is no
  `/api/auto-engineering/state` route, and nothing emits
  `auto-engineering.state`. The references were dropped in the
  server-decomposition merge (`d0564cf0`) and never restored — the flag is a
  no-op, and the UI panel plus the store's client call are dangling.
- **Nothing in `init.ts`, server boot, or empty-board handling runs a PM.** The
  only automatic lifecycle agent run is the reviewer on entering `review`
  (`src/server/server.ts`).
- **The init description's only destination** is 0001's `## Overview`
  (`SAMPLE_TASK` in `src/commands/init.ts`). Nothing reads it back out.
- The mechanism that *can* turn a prompt into tasks is the freeform path
  (`POST /api/tasks/freeform` → `createFreeformTask`, which runs the PM), but
  it is client-initiated and needs a running server — unavailable to `repoos
  init`, which runs before one exists.

**Decision: introduce a new, static mechanism rather than build on
`autoEngineeringMode`.** Even if the orchestrator were rewired, it runs on a
live server and selects among *existing* ready tasks; it cannot act at scaffold
time when there is no server and no task to select. The requirement is "a
workable task on the board the moment init finishes", so a static file is the
only fit. The auto-engineering wiring gap is a separate problem and out of
scope here.
