---
id: "0351"
title: Make css-layers/theme-contrast check guards configurable per project
type: feature
status: ready
priority: p3
area: cli
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-15T09:22:36Z"
updated_at: "2026-09-15T19:14:37Z"
---
## Problem

Found in the #0348 audit of `repoos check` steps
(`docs/audits/2026-09-check-step-genericity-audit.md`, section 2). This doc
lands on `main` when #0348 closes out.

The `css-layers` and `theme-contrast` guards in `src/commands/check.ts` always
read `src/ui-app/src/style.css`. `css-layers` only runs when that file
contains `@import "tailwindcss"`, and `theme-contrast` only runs when it
contains `:root{`. The checks themselves (Tailwind v4 cascade layering, WCAG
contrast) apply to any project, but the file path and the token lists
(`THEME_VARIANTS`, `CONTRAST_PAIRS`, `GRADIENT_TOKENS`) are specific to
RepoOS. So for other projects:

- A project whose UI lives somewhere else (for example
  `apps/web/src/app.css`) gets no coverage. The step quietly skips.
- A project that happens to have a file at that path gets judged against
  RepoOS's own token names.

This never fails a project today, but it also never protects anyone except
RepoOS.

## Direction

Use the `[check]` section #0348 added in `repoos.toml`: a stylesheet path
setting, plus either declared contrast token pairs or a command the project
supplies. RepoOS's own repo should declare its current path and tokens through
that same config, the way #0348 moved RepoOS's UI smoke test onto the generic
`smoke` script, so there's no RepoOS-specific code path.

## Acceptance criteria

- [ ] A project can point both guards at its own stylesheet and tokens.
- [ ] Projects that don't configure them skip cleanly, as they do today.
- [ ] RepoOS keeps its current coverage by declaring it through config, with
      no hardcoded RepoOS-only path in `check.ts`.
- [ ] `repoos check` passes.

## Related

- #0348, where the audit found this

## Activity

- 2026-09-15T09:22:36Z · created · unknown
- 2026-09-15T19:14:37Z · status inbox→ready
