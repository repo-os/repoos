---
id: "0362"
title: Make task previews pluggable per project instead of hardcoded to repoos serve
type: feature
status: ready
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-15T19:33:40Z"
updated_at: "2026-09-15T19:37:54Z"
---
## Problem

`spawnPreview` (`src/server/preview.ts:478`) unconditionally runs
`repoos serve --port N --host H` rooted at the task's worktree — the whole
preview mechanism (start/stop, port derivation, auth story in #0259, error
surfacing in #0269) assumes "preview a task" means "preview RepoOS's own web
UI." That's correct for this repo, where the product IS `repoos serve`'s UI,
but it means nothing for an adopting project. There is currently no
`[preview]` config in `repoos.toml`, no per-project command hook, nothing
analogous to `[check] uiSmoke` (which already lets a foreign repo declare its
own smoke-test command and has the build-staleness step degrade to a skip
when the repo isn't using RepoOS's own `dist/.build-info.json` contract — see
`docs/audits/2026-09-check-step-genericity-audit.md` for that precedent).

Filed as a follow-up from reviewing #0259/#0269: fixing bugs in the current
preview mechanism only benefits RepoOS's own dogfooding loop, not adoption,
until this genericity gap is closed. This task should land BEFORE further
preview polish is prioritized for adoption purposes (#0259/#0269 remain valid
for this repo's own UX but don't move the adoption needle).

## The open design question — read before implementing

A monorepo can hold many different previewable (and non-previewable) things at
once: a marketing/landing page, a docs site, one or more web apps, a mobile
app, a backend/API service, a CLI. "Preview a task" cannot mean the same thing
for all of them, and some of them (a backend service with no UI, a CLI) may
have no meaningful browser preview at all. This task should resolve, not
assume, the following before writing code:

- **Is v1 scoped to web UIs only**, with non-web areas (server/backend/cli/
  mobile-native-only) returning "no preview configured" cleanly rather than
  erroring? (Likely yes for a first cut — validate against this repo's own
  `area:` values in `src/core/types.ts` and how `check.ts`'s per-project config
  already reads `repoos.toml`.)
- **How does a monorepo with multiple previewable things pick which one to
  run for a given task?** Candidate approaches to weigh, not a prescribed
  answer:
  - A single configured preview target per repo (simplest — matches today's
    one-preview-slot-at-a-time FIFO-eviction constraint from #0271; punts
    multi-target selection to a later task).
  - Multiple named targets in `repoos.toml` (e.g. `[[preview.targets]]` with a
    `path`/glob and a `command`), selected by matching the task's changed
    files or its `area:` frontmatter to a target.
  - Something else — worth a quick look at how other monorepo tooling (Nx,
    Turborepo, etc.) scopes "which app does this change affect" before
    inventing a new answer here.
- **Mobile is a special case, not a fourth thing to solve separately**: per
  `docs/mobile-architecture.md` (#0297), the shipped mobile app is a Capacitor
  shell that opens the SAME web UI in an opaque InAppBrowser — there is no
  separate "mobile app dev server" to preview. Mobile-area tasks should most
  likely reuse whatever web preview target is configured, not need their own.
- **Backward compatibility**: when no `[preview]` config exists (this repo,
  today), fall back to exactly the current `repoos serve`-on-worktree
  behavior, so self-hosted RepoOS previews keep working with zero config
  changes.

## Acceptance criteria

- [ ] `repoos.toml` gains a way to declare how to preview a project (command +
      port placeholder, at minimum), following the `[check]` section's
      existing config pattern rather than inventing a new one.
- [ ] The monorepo multi-target question above is explicitly decided (not left
      ambiguous) and the decision is written into this task or a doc before/as
      part of implementation.
- [ ] A repo with no `[preview]` config continues to get today's `repoos
      serve`-on-worktree behavior unchanged (this repo's own previews must
      keep working).
- [ ] A task in an area with no configured preview target gets a clear "no
      preview configured" response instead of a spawn failure.
- [ ] `repoos check` passes with no regressions.

## Notes for AI

- Relevant code: `src/server/preview.ts` (`spawnPreview`, `resolveServeEntry`,
  the whole `PreviewManager`), `src/core/types.ts` (`RepoOSConfig`, `area`
  values), `src/commands/check.ts` (for the `[check]`-section config pattern
  to mirror).
- Related tasks: #0259 (preview auth), #0269 (preview reliability/errors) —
  both currently scoped against the RepoOS-specific mechanism and may need
  re-scoping once this lands. #0271 (one-preview-at-a-time FIFO eviction),
  #0297/#0300 (mobile architecture — confirms mobile has no separate preview
  target).
- Source: user conversation flagging that #0259/#0269 don't serve the
  "other projects can adopt RepoOS" goal until this genericity gap closes.

## Activity

- 2026-09-15T19:33:40Z · created · unknown
- 2026-09-15T19:37:54Z · status inbox→ready
