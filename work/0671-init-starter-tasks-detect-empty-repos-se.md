---
id: "0671"
title: "init starter tasks: detect empty repos, seed as inbox, mark created_by repoos-init"
type: feature
status: review
priority: p2
area: cli
assigned_to: ai
created_by: ""
branch: feat/init-starter-tasks-detect-empty-repos-se
created_at: "2026-10-05T15:20:09Z"
updated_at: "2026-10-05T17:07:33Z"
review_passes: 2
---
## Problem

`repoos init` seeds a starter task chosen by code path, not by what is in the repo, and always seeds it as `ready`:

- Inside any git repo (even `git init` with zero commits, or only an empty commit) it seeds `Read this codebase and propose docs + an initial task backlog` (`scaffoldInto(..., "existing")`, `src/commands/init.ts` ~line 1462). In an empty repo there is nothing to read; an agent given this task invents documentation. Reproduced with two throwaway repos (no commits; one empty commit): both got `0002-read-the-codebase.md`.
- Both starters (the existing-codebase one and the new-project `Flesh out the product vision` one) are written with `status: ready`. Anything that auto-starts ready tasks (`autoEngineeringMode`, a driver script, a person skimming "Ready") picks them up immediately. An agent doing so on the wrong starter wastes a run and pollutes the docs.
- Seeded tasks say `created_by: human`, so nothing can tell them apart from real work later.

Task 0364 deliberately chose `ready` so the Ready column is not empty after init. This task revisits that trade-off: the owner now prefers `inbox`/`draft` because a seeded task is a suggestion to the human, not work to auto-run.

## Desired UX

- Starter choice follows the repository's content: if the repo has no meaningful source files (ignore RepoOS's own scaffold, `.gitignore`, README, LICENSE, empty dirs, `.git`), seed the product-vision starter; otherwise seed read-the-codebase. A clear one-line message says which was chosen and why, and how to switch (`--starter vision|codebase`).
- Starter tasks are created with `status: inbox` (or `draft` if that fits the board better), never `ready`. The init summary tells the user to promote one when ready.
- Starter tasks carry `created_by: repoos-init`, so they can be filtered and auto-archived once a real backlog exists (ties in with the Archive-task feature, task 0657).
- The "Set up RepoOS" worked example (0001) stays `done` as today.
- Doctor/lint nicety (optional): `repoos doctor` notes a seeded starter still sitting in the inbox after N real tasks exist, suggesting archive.

## Acceptance criteria

- Empty-repo detection implemented as a small pure function with unit tests (empty repo, README only, only RepoOS scaffold, a repo with `src/` files, a repo with just a `package.json` + `.gitignore`, a monorepo).
- `scaffoldInto` (or its callers) picks the starter via that function for the non-guided path; the guided new-project flow keeps seeding the vision starter.
- Both starters are created as `inbox` with `created_by: repoos-init`; tests assert status and creator. Update the existing tests that assume `ready`.
- Board/UI shows nothing broken with `created_by: repoos-init` (check the UI that renders `created_by`).
- Docs: `user-docs/getting-started.md` ("Create your first task" and the init section) updated: starter tasks start in the inbox; mention `--starter`. Note in the task activity that 0364's `ready` decision was changed and why.
- `repoos check` passes.

## Notes for AI

Read tasks 0364 and 0028 first (they explain the original design). This does not change what the starter tasks SAY except that the existing-codebase one may gain a first line: "If this repository is actually empty, close this task and use the product-vision task instead." Never hand-edit work/*.md; use RepoOS commands/APIs.

## Activity

- 2026-10-05T15:20:09Z · created · unknown
- 2026-10-05T15:38:16Z · status inbox→ready
- 2026-10-05T15:38:19Z · status ready→active, branch
- 2026-10-05T16:06:57Z · note: Revised #0364's decision: seed the starter as inbox, not ready. #0364 chose ready so the Ready column wasn't empty after init, but a seeded task is a suggestion for the human, not work to auto-run — auto-starting it (autoEngineeringMode/driver/a skimmer) wasted a run and polluted docs on the wrong starter. Starters also now carry created_by: repoos-init (was human) so they can be filtered/archived once a real backlog exists, and the existing-repo path picks the starter by repo content (effectively empty repo -> product-vision; source present -> read-the-codebase), overridable with --starter vision|codebase.
- 2026-10-05T16:37:30Z · status active→review
- 2026-10-05T16:37:30Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-05T16:58:57Z · status review→active
- 2026-10-05T17:02:06Z · status active→review
- 2026-10-05T17:02:06Z · status review→active
- 2026-10-05T17:02:41Z · status active→review
- 2026-10-05T17:02:41Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped

