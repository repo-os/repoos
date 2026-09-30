---
id: "0599"
title: Fix init-generated .gitignore for runtime cache and .DS_Store
type: bug
status: review
priority: p2
area: cli
assigned_to: ai
created_by: hello@repoos.org
branch: feat/fix-init-generated-gitignore-for-runtime
created_at: "2026-09-30T06:36:06Z"
updated_at: "2026-09-30T07:21:12Z"
---
## Problem

`repoos init` appends a small set of lines to the repository `.gitignore`, but that template is incomplete for day-to-day use on macOS and for RepoOS runtime artifacts.

Newly initialized repositories do not reliably ignore a root-level `.repoos/` runtime directory or `.DS_Store` files at arbitrary depth. After init, serving RepoOS or working in the tree on macOS can leave a SQLite runtime database under the configured cache directory and Finder metadata files on disk that show up as untracked noise in `git status`, even though they should never be committed.

The namespaced default layout already relies on a `repoos/.repoos/*` ignore with a negation so `repoos/.repoos/canary.txt` stays tracked for the canary flow-test workflow. Any fix must keep that pairing intact; weakening or removing it would break the deliberate canary exception.

## Desired UX

When a user runs `repoos init` on a **new** repository (fresh `.gitignore` or append of missing RepoOS entries only, per today’s init behavior), the resulting `.gitignore` should:

- Ignore the repository root `.repoos/` runtime directory (so root-level RepoOS runtime state does not appear in Git).
- Ignore `.DS_Store` at any depth (e.g. a pattern that covers nested directories, not only the repo root).
- Continue to include the existing cache-dir rule derived from `cacheDir` — for the default namespaced layout, `repoos/.repoos/*` — and the matching negation `!repoos/.repoos/canary.txt` so the canary counter file remains trackable.
- Leave **already-initialized** repositories unchanged beyond today’s append-only, line-presence checks (no new migration pass, no rewriting of this repo’s or customers’ `.gitignore` wholesale).
- Leave the canary workflow itself unchanged (counter file location, negation semantics, server/task behavior).

Developers who init a repo, run RepoOS enough to create runtime state, and drop files on disk should see a clean `git status` for ignored artifacts while `repoos/.repoos/canary.txt` (or the equivalent path for the chosen layout) remains tracked when committed by init.

## Acceptance criteria

- [ ] `repoos init` scaffolding adds gitignore rules so a **root** `.repoos/` directory is ignored on newly initialized repos (without removing or altering the canary negation pattern for the configured `cacheDir`).
- [ ] `repoos init` scaffolding adds a gitignore rule that ignores `.DS_Store` files at any depth under the repository.
- [ ] For the default namespaced init (`cacheDir = "repoos/.repoos"`), the generated `.gitignore` still contains `repoos/.repoos/*` and `!repoos/.repoos/canary.txt` (or the equivalent lines produced via `canaryGitignoreIgnore` / `canaryGitignoreNegation` for that `cacheDir`).
- [ ] Root-layout init (`cacheDir = ".repoos"`) continues to use `.repoos/*` with `!.repoos/canary.txt` as today; existing `init-scaffold` expectations for the canary gitignore lines still pass.
- [ ] A new automated test covers a **fresh** init: scaffold a clean repo, create a runtime database file under the cache directory (e.g. `repoos.db` in the configured `cacheDir`), create nested `.DS_Store` files (e.g. under `work/` or the cache dir), run `git status` (or `git check-ignore`) and assert those paths do not appear as untracked/modified while `repoos/.repoos/canary.txt` (namespaced default) remains tracked after `git add` of init output.
- [ ] No changes to canary increment/task-creation workflow, `patchGitignoreForCanary` upgrade behavior for legacy ignores, or other repositories’ on-disk `.gitignore` except what init writes for **new** missing lines going forward.
- [ ] `bun run fmt` and scoped `repoos check --changed main` pass.

## Notes for AI

- Primary touchpoint: `src/commands/init.ts` — the `ignoreLines` block written/appended around the derived cache and `.env` entries (~lines 599–618). Prefer extending that list (with comments consistent with existing entries) rather than ad hoc string edits elsewhere.
- Reuse `canaryGitignoreIgnore` / `canaryGitignoreNegation` from `src/core/canary.ts` for cache-dir lines; do not change canary path helpers or `scaffoldCanaryFile` behavior unless a gitignore pattern truly requires it (user asked not to change the canary workflow).
- **Assumption:** “Root `.repoos/` runtime directory” means a top-level `.repoos/` at the repository root, which may coexist with namespaced `repoos/.repoos` as `cacheDir`. If both need distinct patterns, document the chosen patterns in the init comments and mirror them in tests.
- **Assumption:** “Runtime database” in the test means a file under `cacheDir` matching production layout (see `join(cacheDir, "repoos.db")` in `src/core/db.ts` / auth store), created empty or minimal after init — no need to boot a full server if touching the path suffices for `git status`.
- Extend `src/ui-app/tests/init-scaffold.test.ts` (or a focused sibling test next to it) for the fresh-init git status scenario; use the same `scaffoldInto` harness as existing init tests. Initialize git in the scratch repo if not already done by the fixture.
- Update adoption-matrix expectations in `src/ui-app/tests/adoption-matrix.test.ts` only if init output strings change (e.g. new `.DS_Store` line); keep assertions aligned with append-only init semantics.
- **Do not:** run migrations on this repo’s `.gitignore` alone, change `work/` canary tasks, alter close-out/canary server logic, or broaden `patchGitignoreForCanary` to rewrite unrelated customer ignore files beyond current upgrade behavior.

## Scope

**In scope:** Gitignore lines emitted by `repoos init` for new/missing entries; unit/integration test proving ignore behavior and canary still tracked.

**Out of scope:** Changing default `cacheDir` layout, modifying the canary counter workflow, retroactively fixing every existing clone’s `.gitignore` outside init’s current append model, or adding `.DS_Store` to global git config.

## Related

- Existing coverage: `src/ui-app/tests/init-scaffold.test.ts` (“scaffolds the canary counter file and gitignore exception”).
- Canary gitignore helpers: `src/core/canary.ts`.

## Original prompt

Fix the .gitignore generated by repoos init. New repositories should ignore the root .repoos/ runtime directory and .DS_Store files at any depth. Preserve the existing repoos/.repoos/* rule and its exception for the tracked repoos/.repoos/canary.txt. Add a fresh-init test that creates a runtime database and nested .DS_Store files, verifies they do not appear in Git status, and verifies the canary remains tracked. Do not change existing repositories or the canary workflow.

## Activity

- 2026-09-30T06:36:06Z · created · hello@repoos.org
- 2026-09-30T06:37:11Z · status draft→inbox, title, area, type, body
- 2026-09-30T06:37:52Z · status inbox→ready
- 2026-09-30T06:37:57Z · status ready→active, branch
- 2026-09-30T07:21:12Z · status active→review
