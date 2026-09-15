# Task previews are pluggable per project

Task #0362. Read this before touching `src/server/preview.ts` or the `[preview]`
section of `repoos.toml`.

## Problem

`PreviewManager` used to unconditionally spawn `repoos serve` rooted at a
task's worktree. That is correct for RepoOS's own dogfooding loop — the product
*is* `repoos serve`'s UI — but says nothing to an adopting project, where
"preview a task" means "boot *our* landing page / docs site / web app". The
preview mechanism had no per-project command hook, unlike `repoos check`'s
opt-in `[check] uiSmoke`.

## Decision

`repoos.toml` gains a `[preview]` section (plus repeatable
`[[preview.targets]]` tables), following the same flat-config pattern as
`[check]`. A task is previewed by:

1. a named target whose `areas` list includes the task's `area:` frontmatter
   (case-insensitive), else
2. a default `[preview] command`, else
3. — when the section exists but neither matched — a clean
   **"No preview configured for area …"** result, not a spawn failure;
4. — when the section is entirely absent — RepoOS's own `repoos serve`
   fallback, so self-hosted repos keep working with zero config changes.

```toml
[preview]
command  = "bun run dev --port {port}"   # optional default target
cwd      = "apps/site"                    # optional, relative to the worktree
readyPath = "/"                           # optional, default "/"

[[preview.targets]]
name      = "Landing page"
areas     = ["landing", "web"]
command   = "bun run dev --port {port}"
cwd       = "landing"
readyPath = "/"
```

- `{port}` / `{host}` are replaced with the OS-assigned values, and `PORT` /
  `HOST` are exported into the child's environment.
- `readyPath` is the path polled for readiness (and probed server-side after
  start). The default is `/`; it must not be `/api/health`, which is RepoOS's
  own health contract and only assumed for the `repoos serve` fallback.
- The RepoOS build-staleness step (`ensureFreshBuild`) runs **only** for the
  fallback. A project-declared command owns its own build; a foreign repo's
  `src/` has nothing to do with RepoOS's `dist/.build-info.json` contract.

## The monorepo multi-target question (the decision)

Other monorepo tooling (Nx, Turborepo) maps a change to *affected projects* via
a project graph built from imports and package boundaries. RepoOS has no such
graph — inferring it would be a large, separate project — but it does already
carry the one signal that matters here: each task's `area:` frontmatter.

So v1 selects a target by **`area` match**, not by diffing changed files. That
is deliberately simpler than Nx-style affectedness and matches how tasks are
already filed. Changed-file globs were considered and deferred: they add a
second selection axis with its own precedence rules for a case (one task
touching several apps) that `area` already covers at this scale.

**v1 is scoped to browser-previewable things.** A target is a command that
boots something serving HTTP. Non-web areas (a backend with no UI, a CLI) get a
preview only if a target's `areas` claims them — and if a repo declares targets
without a default command, any unmatched area gets the clean "no preview
configured" result above. Mobile is not a separate target: per
`docs/mobile-architecture.md` (#0297) the shipped mobile app is a Capacitor
shell that opens the same web UI, so a `mobile` area simply points at whatever
web target exists (`areas = ["mobile", "web"]`).

## Backward compatibility

No `[preview]` section → `resolvePreviewTarget` returns the `repoos` fallback,
`resolveServeEntry` picks the worktree's own compiled CLI (falling back to the
control plane's), and readiness is `/api/health`. This repo declares no
`[preview]` config, so its own previews run the exact code path they always
did. The existing `server-owned-preview` / `auto-preview` integration tests are
the regression guard for that path.

## Process lifecycle

A custom command is spawned through a shell (so `&&`, pipes, and env prefixes
work) with `detached: true` on POSIX, making it its own process group. Stop /
eviction / boot-time cleanup signal `-pid` (the group), so a shell's whole tree
comes down, not just the shell. The repoos fallback is spawned directly and is
identified structurally (CLI entry + `--port N`) for orphan cleanup; a custom
child is identified by its recorded resolved command instead. Both are recorded
in `<cacheDir>/previews.json` for crash recovery.
