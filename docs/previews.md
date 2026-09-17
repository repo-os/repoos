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
3. — when neither matched, or when the section is absent entirely — a clean
   **"No preview configured for area …"** result, not a spawn failure (#0370).
   There is no implicit default: a project that hasn't declared a preview for a
   task's area gets an actionable message (the task's area, and the minimal
   `[preview]`/`[[preview.targets]]` snippet that would resolve it), never
   RepoOS's own board.

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
  start). The default is `/`.
- **A declared command must run the worktree's own code.** RepoOS no longer
  picks the CLI entry for you — that was `resolveServeEntry`, removed with the
  fallback in #0370. A command that invokes a globally installed binary serves
  stale code: UI changes may still appear (the worktree's `bun run build`
  refreshes root-relative `dist/ui`), but server/core changes in the worktree's
  `src/` never execute, and a new API route 404s into the SPA fallback — the
  #0313 failure. This repo's own command therefore builds and then runs the
  worktree's compiled entry directly:
  `bun run build && bun dist/cli/index.js serve --port {port} --host {host}`.

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

## Target identity and multiple matches (#0379)

The quickbar names the target being served, not just "a preview is running":
`PreviewInfo.label` (the target `name`, or `"default"` for the bare
`[preview] command`) is carried on the start response, the `preview` SSE event,
and `GET /api/tasks/:id`, and the drawer renders it as a chip next to the live
URL — and inside the "Starting preview — …" progress text.

Because resolution is by **`area`**, "multiple matches" means more than one
`[[preview.targets]]` declares the task's area (the config-order first match is
no longer assumed to be the only one). When a task's area resolves to more than
one target:

- `previewTargetOptions(config, task)` returns every match, and the board /
  `GET /api/tasks/:id` responses carry it as `previewTargets` so the drawer can
  list them.
- The drawer shows a picker and **disables Start until the user chooses**. The
  choice is sent as `{ "target": "<name>" }` on `POST /api/tasks/:id/preview`.
  The server enforces this too — an ambiguous area started with no `target` is
  rejected (`matches more than one preview target`), never resolved to the first
  — and an unknown name is a clean error, never a silent fallback. Asking for a
  *different* target while one is already running is likewise an explicit
  mismatch error, not an idempotent `200` that hands back the wrong target.
- Target names are the pick key, so `parsePreviewConfig` keeps them unique:
  auto-derived (`areas.join("/")`) and explicit duplicates get a numeric suffix
  (`web`, `web (2)`), so the picker can't render identical options and label
  matching can't select the wrong target.
- The agent-request path (`::repoos-preview-request::`) has no picker, so it
  opts into the config-order first match and records the label in the transcript
  ("Managed preview ready (target: docs)") so the choice is not silent either.

The single-match case (today's common case) is unchanged: one click starts the
one target, and only the name label is new. A task spanning *genuinely*
different areas still has one `area:` and therefore one resolved set; the
changed-file-glob axis that would split it remains deferred (above).

## No implicit fallback (#0370)

There is no default preview target. An absent `[preview]` section behaves
exactly like a present one with no matching target: `resolvePreviewTarget`
returns `{ kind: "none", reason }`, the start request fails cleanly, and the UI
shows the reason as a toast (option 2 of #0370 — show the affordance, explain on
click — matching the pre-existing "present but no match" behavior). The reason
names the task's `area` and includes the minimal `repoos.toml` snippet that
would make it resolve.

The old `repoos serve`-on-worktree fallback existed only for RepoOS's own
self-hosted repo, which now declares its preview explicitly in `repoos.toml`
(`[preview] command = "bun run build && bun dist/cli/index.js serve …"` plus
`landing`/`docs` targets). No adopter should ever want RepoOS's own board as
*their* app's preview, so the fallback — and its supporting `resolveServeEntry` /
`ensureFreshBuild` code — was removed rather than gated behind an "is this
RepoOS itself" heuristic. As of #0377 the preview doesn't need its own staleness
check to stay fast: `bun run build` is itself staleness-aware, so an unchanged
worktree's preview skips the rebuild (~0.1s) instead of paying a full one.

## Open question: `area` is free text and single-valued

`area:` has no schema (`--area` is documented as free text) and a task carries
exactly one, which limits area-based matching in two ways worth naming even
though #0370 did not fix them:

- A task spanning multiple areas (a bug touching both a frontend and a backend)
  has no natural single preview target.
- Nothing enforces consistent area naming across a project's tasks — RepoOS's
  own tasks mostly use generic `area: web` regardless of whether they touch the
  main app, the landing page, or the docs site.

A more reliable selection axis might be the paths a task's diff actually
touches (rather than a free-text field an agent has to remember to set), but
that is a larger redesign, deliberately deferred.

## Process lifecycle

A command is spawned through a shell (so `&&`, pipes, and env prefixes work)
with `detached: true` on POSIX, making it its own process group. Stop /
eviction / boot-time cleanup signal `-pid` (the group), so a shell's whole tree
comes down, not just the shell. A preview child is identified for orphan
cleanup by its recorded resolved command; every preview is recorded in
`<cacheDir>/previews.json` for crash recovery.

**Windows:** `detached` stays `false` there (no portable process-group
equivalent), so stopping a preview only signals the immediate `cmd.exe` child —
a shell command with its own subprocess tree (`&&`-chained scripts, an `npm`
wrapper spawning a real dev server) can leave a grandchild running with the
port still bound after "stop." Not a regression from the previous behavior
(the old `repoos` fallback had the same limitation), just a limit worth knowing
before relying on previews for a Windows-hosted repo.
