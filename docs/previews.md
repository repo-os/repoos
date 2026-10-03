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

1. a named target whose `areas` list includes any area of the task's `area:`
   frontmatter (case-insensitive; `area` may be a comma/list of several, so
   `area: [web, docs]` matches a `docs` target — #0583), else
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
paths     = ["landing/**"]                # optional, for `repoos shot` (#0582)
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
already filed. Changed-file globs were considered and deferred for *routing*: at
this scale `area` already covers the common case, and #0582 later added them
only for `repoos shot`'s screenshot-target choice (see below), where the
area-first guess has no human to correct it before capture.

**v1 is scoped to browser-previewable things.** A target is a command that
boots something serving HTTP. Non-web areas (a backend with no UI, a CLI) get a
preview only if a target's `areas` claims them — and if a repo declares targets
without a default command, any unmatched area gets the clean "no preview
configured" result above. Mobile is not a separate target: per
`docs/mobile-architecture.md` (#0297) the shipped mobile app is a Capacitor
shell that opens the same web UI, so a `mobile` area simply points at whatever
web target exists (`areas = ["mobile", "web"]`).

## Changed-file target resolution for screenshots (#0582)

`repoos shot` picks the screenshot target from something the `area` cannot see:
which files the diff actually changed. Each `[[preview.targets]]` may carry an
optional `paths` glob list; a changed file matching any glob (via
`src/core/shot-targets.ts`, a tiny dependency-free matcher) makes that target a
candidate, independent of the task's `area:`. The bare `[preview] command` can
carry its own `paths` too (#0594) — with none declared the default target is
only reachable through area resolution, which is how a mixed app+docs diff used
to screenshot just the docs. Files matching no target's globs never imply the
default: a task diff always contains the task's own `work/*.md`, which is no
evidence about the UI. This is intentionally a *screenshot* concern, not a
preview-routing one: the human's **Preview** button still resolves by `area`
(the follow-up noted in #0582 would let the same map choose the default target
there). Area resolves as the fallback, and `--target` overrides both.

The same helper drives the drawer's area/target mismatch warning: whenever the
changed paths touch a target the task's `area` does not resolve to — including
when only one of several touched targets is unexplained — the warning names it,
so a stale `area:` is surfaced rather than silently screenshotting the wrong
app. The default target never counts as an unexplained hit: it is the implicit
main-app fallback, not something an area is expected to resolve to. `area` is
also
split on `+`/`,` (`splitAreas`) for both routing and the warning, so a value
like `web + core + server` and the target areas are compared element-wise.
Captured PNGs go under `work/.attachments/<taskId>/shots/` (gitignored, never
referenced from the task body) and render in the drawer's Changes tab.

## Automatic capture at handoff, and a task's `## Shots` list (#0594)

Engineers do not have to remember to run `repoos shot` any more: when a task
moves to `review` and its diff touches any target's `paths` globs, the SERVER
runs the capture itself through the server-owned `PreviewManager` — the same
page choreography as the CLI (`src/core/shot-page.ts`), never a parallel
`serve`. A capture can never fail a handoff; skips and failures are recorded
as visible `shots: skipped — <reason>` / `shots: failed — <reason>` entries in
the task log and the activity log (missing Playwright is the common skip, and
it links the install advice).

What to shoot is declarative: a task body may carry a `## Shots` section with
a fenced JSON list (`src/core/shot-plan.ts`), one entry per capture —
`target`, `route`, optional `selector`, an optional `highlight` CSS selector
(outlines the changed element(s) in the capture, #0603), a human `label`, and
optional ordered `steps` (`click` / `fill`+`text` / `waitFor` / `waitMs`,
plain CSS selectors). Routes and selectors only — no framework knowledge.

**Shot hygiene (#0613).** When a declared `highlight` or `selector` matches
zero elements at capture time, a visible warning is recorded on the task
(for example: highlight `.x` matched nothing on /route) — capture still succeeds.
Declared shots with the same `target` + `route` + `steps` + `selector` are
collapsed to one capture, with `highlight` selectors merged (comma-joined),
so near-duplicates become one capture.

**Whole-window default (#0613).** Declared shots capture the whole visible
viewport by default (`fullPage: false`) with changed elements outlined via
`highlight`. `selector` (element crop) is the only exception; `fullPage`
stays off. Prefer `?tab=<id>` routes (e.g. `/agents?tab=detected`) over click
steps to reach the right tab in tabbed views, and always set `highlight` to
the changed elements.

#0603 tightened what the automatic pass will shoot, because #0600's review
captured an unlabeled `/` frame that showed nothing about its change (its diff
added tests under `src/ui-app/tests/`, which the plain `src/ui-app/**` glob
matched): test artifacts (`*.test.ts`, `*.spec.ts`, `*.snap`, `__tests__/`,
`__snapshots__/`, and any file under a `tests/`/`test/` directory) are
filtered out before glob matching — they are behavior evidence, not
appearance — a docs target matched only by content files (`*.md`/`*.mdx`)
needs a declared route, since `/` would be the docs home page rather than the
page that changed. The fallback is NOT abolished: a diff that touches a UI
target's paths with no declaration still gets one `/` shot per target —
captioned `auto: matched <glob>` — but a diff whose only glob evidence is
tests or task notes stands down with a visible skip instead of capturing a
blind home page. The CLI keeps its `/` fallback: a human invoked it by hand.
Declared `## Shots` resolve targets the way the CLI does (changed paths,
then the task's `area`, then the default command), so an explicit declaration
is honored even when the diff matches no glob; and repos whose UI is itself
markdown-driven should know a UI-relevant `.md` change counts as content —
declare the shot with its route.

**Drawer add/delete (#0627).** Shots can also be added and deleted from the

task drawer's UI changes section, while the task is `active` or in `review` —
`POST /api/tasks/:id/shots` (declare + capture; the CLI's byte-upload on the
same route is dispatched by the body's `data` field) and
`DELETE /api/tasks/:id/shots/:name`. The non-obvious rules:

- A hand-added shot is captured BEFORE its declaration is written, so a failed
  capture (route didn't load, WebKit missing) never leaves a
  declared-but-never-captured entry behind; the response error is the only
  trace of the attempt. The stored shot carries the declared provenance but NO
  `origin: "auto"` — re-handoff cleanup (`removeAuto`) never deletes it, and
  the automatic pass still treats it as engineer-made (stands down).
- The single-entry path validates through `parseShotEntry` in
  `core/shot-plan.ts` — the same validator the CLI's `--shots` uses; there is
  no second copy. Request fields reach the validator verbatim, so a wrong
  type (`{"target": 5}`) is rejected rather than silently narrowed to an
  omitted field.
- Delete removes the PNG and the manifest entry, and then the declaration:
  a hand-added shot stores its full parsed declaration in the manifest
  (`ShotMeta.declared`), so delete syncs THE exact `## Shots` entry —
  selector and steps included, via `sameDeclaredShot`. Legacy and auto shots
  (captured before that field existed) fall back to the shallow
  label/route/target matcher, which requires at least one identifying field —
  an anonymous declaration (steps or highlight only) can never claim a
  deleted shot. That matcher cannot tell apart declarations differing only in
  selector/steps, so when it matches MORE than one entry delete removes none
  (`removeDeclaredShots` with `requireUnique`) and returns a warning telling
  the user to edit `## Shots`; erasing distinct declarations would be worse
  than leaving one that a re-handoff may recapture. (The exact-match path for
  hand-added shots still removes every identical twin.)
- Add-shot warnings (a `highlight`/`selector` that matched nothing) ride the
  success response as `warning`; the modal stays open showing it, since the
  shot is already saved.
- Busy semantics differ from the handoff pass on purpose: the automatic
  capture replaces the task's preview (`startTargetPreview`), while a manual
  add NEVER evicts a running preview. The reservation is atomic —
  `PreviewManager.start({ noEvict: true })` makes the capacity decision at
  start time, counting both registered previews and starts still in flight (a
  preview is registered only after spawn and readiness, so the registry alone
  would let concurrent starts exceed the cap) — so a preview that begins
  between the capture's snapshot check and its start is refused, not evicted.
  The same target's live preview is reused without a restart. An explicitly
  picked target is resolved through `resolveShotTargets`' override path, so
  every target the drawer offers can be captured even when the task's `area`
  does not name it.

`repoos shot`'s own flags sit on top of that plan (#0610). `buildCliShotPlan`
(`src/commands/shot.ts`) is a pure function of the task body, the flags and the
resolved targets — it used to live inline in `cmdShot`, where a typed route
built its own entries and then lost the `built.entries.length ? … : …` pick to
the fallback's `/`, so `repoos shot /repo/commits/abc123` captured the preview
root. Two rules, both documented in `user-docs/cli.md` and `repoos shot
--help`: an explicit route/selector replaces the WHOLE declared list (a
declared entry's steps/highlight/label belong to its own route, so they are
never re-pointed), and `buildCapturePlan` now takes the requested
route/selector so its fallback inherits them instead of hardcoding `/`. The
same options lift the docs-content-only skip — a route named by hand is the
justification that skip asks for. The server's automatic pass passes neither
option, so its blind `/` fallback and its conservative gates are unchanged.
Every
shot records its provenance in `shots.json` and the drawer — `declared:
<label>` for a declared shot, `auto: matched <glob>` for the fallback, so
a reviewer can tell what each capture claims to show.

An engineer-made capture pre-empts
the automatic one: shots already on disk stand down the auto pass, rather than
duplicating or overwriting them.

## Target identity and multiple matches (#0379)

The quickbar names the target being served, not just "a preview is running":
`PreviewInfo.label` (the target `name`, or `"default"` for the bare
`[preview] command`) is carried on the start response, the `preview` SSE event,
and `GET /api/tasks/:id`, and the drawer renders it as a chip next to the live
URL — and inside the "Starting preview — …" progress text.

A task's `area` is often wrong (#0409 was about the landing page and docs site
but tagged `web`, so it could only preview the app). Since #0411 the drawer
therefore offers **every** configured target, not only area matches:

- `previewTargetOptions(config, task)` ranks them: targets matching the task's
  area first, then the `[preview] command` default, then every other target.
  The board / `GET /api/tasks/:id` responses carry this as `previewTargets`.
- Whenever there is more than one option, the drawer shows a dropdown
  pre-selected to the top-ranked one, and sends the choice as
  `{ "target": "<name>" }` on `POST /api/tasks/:id/preview`. One preview runs
  per task: while it's up the dropdown is hidden, so switching targets means
  Stop preview, pick another, start again.
- Without an explicit pick, the server only ever serves an area match or the
  default, never an unrelated target just because it's configured. A task
  whose area matches nothing, in a repo with no default, gets a clean
  "No preview configured for area …" error.
- It is ambiguous, and rejected without a `target`, only when **several
  targets match the task's area** (`matches more than one preview target`).
  Out-of-area targets are listed for recovery but never make a start
  ambiguous. An unknown name is a clean error, never a silent fallback, and
  asking for a *different* target while one is already running is an explicit
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

## Secrets in the worktree: `[worktrees] inheritEnv` (#0373)

A preview boots *inside the task's worktree*, which is a fresh checkout cut
from `main` — so a gitignored `.env` at the repo root is **not** present there
by default. For most projects that's fine; a preview command with no secret
dependency just runs. It is not fine for a repo like this one, where
`auth.enabled = true` and the `serve` process refuses to start without the
provider keys that live only in `.env`. The failure is a hard one, not a
degraded preview:

    Failed to start server: Auth is enabled but no login provider is configured.

`repoos.toml` therefore has an opt-in:

```toml
[worktrees]
inheritEnv = true   # default false — no .env is placed in worktrees
```

When set, `ensureWorktree` (`src/core/git.ts`) symlinks the main checkout's
`.env` into the worktree on both creation and reuse, so a worktree-local build
or preview command can read the same secrets the main checkout does. It is
deliberately opt-in rather than automatic (unlike `node_modules`): most
projects never need `.env` in a worktree, and each worktree is another place
secrets would live on disk. Absent, malformed, or with no `.env` at the main
root, the link is a silent no-op and worktrees behave exactly as before.

**Prerequisite: the repo's `.gitignore` must ignore `.env`.** `linkInheritedEnv`
runs `git check-ignore .env` in the worktree before linking and skips it when
the path is not ignored — placing a secret in a path git could commit is worse
than a preview that can't boot. The committed `.gitignore` propagates to every
worktree, so a repo that ignores `.env` on `main` is covered automatically.
`.env` therefore stays gitignored in the worktree, never enters git history,
and `git status` in the worktree stays clean.

The preview path repairs a missing link too: `PreviewManager.doStart` calls
`linkInheritedEnv` for the resolved worktree, so a task cut *before* the repo
opted in — or one whose link was removed — gets it on the next preview request
instead of waiting for another task start. (This cannot repair a worktree
before the opt-in reaches `main`: task creation and preview both read the
opt-in from the main checkout's `repoos.toml`.) A dangling link left by a later
deletion of `main`'s `.env` is repointed once that file returns, rather than
throwing `EEXIST` forever. A symlink (not a copy) is used on purpose: there is
one source of truth, so a secret added to the main `.env` later is immediately
visible in every live worktree instead of going stale in per-worktree copies,
and no extra physical copy of every secret lands on disk. The one thing a copy
would avoid — a worktree process writing *through* the symlink back into main's
`.env` — is narrow: the only writer, `setDotEnvSecret`, is called by the
server's model-provider settings and targets its own config root.

## Preview-only config overrides (#0464)

A preview sometimes needs a deliberately different runtime config from the base
`repoos.toml` — the motivating case is auth: keep `auth.enabled = true` for
normal use, but boot local previews with it off so screenshot/browser tooling
needn't clear the OTP flow. `repoos.toml` therefore accepts a `[preview.<path>]`
overlay:

```toml
[auth]
enabled = true

[preview.auth]
enabled = false
```

Mechanically this is small and deliberately narrow:

- `parsePreviewOverlays` (`src/core/config.ts`) treats every flat `preview.*`
  key whose head is not a preview-feature key (`command`, `cwd`, `readyPath`,
  `readyTimeoutMs`, `targets`) as an override of the base key after the prefix.
  Because `parseFlatToml` already flattens nested tables, deep merge is inherent:
  `[preview.auth] enabled = false` contributes only `auth.enabled`, leaving the
  rest of `[auth]` at base values.
- `loadConfig(root, { previewOverrides: true })` re-applies those keys over the
  base parse before the normal field reads, so precedence is defaults → base
  config → preview overlay → explicit CLI flags. Only supported keys
  (`SUPPORTED_TOML_KEYS`) may be overridden; an unknown path warns and is
  dropped. Applied keys land on `config.previewOverrides` for reporting.
- The option is threaded `cmdServe` → `startServer` → `createRepoOS` →
  `loadConfig`. `cmdServe` defaults it to `process.env.REPOOS_PREVIEW_CHILD ===
  "1"`, which `PreviewManager.spawnPreview` already sets on every preview child,
  so a `repoos serve` preview applies the overlay automatically. Ordinary
  `repoos serve` never does. `--preview-overrides` forces it on (UI-test
  previews); **`--no-preview-overrides`** is the escape hatch back to base.
- Safety: when an override disables auth, `startServer` coerces a wildcard bind
  (`0.0.0.0`, from the Tailscale auto-default) back to `127.0.0.1` unless the
  caller passed `--host` explicitly — an auth-less preview must not reach the
  tailnet. `resolveServeHost`'s Tailscale branch is the only way that wildcard
  arises. The preview child already gets `--host 127.0.0.1` from
  `spawnPreview`, so this is the backstop, not the primary path.
- Reporting: `PreviewManager.doStart` reads the worktree's declared keys via
  `readPreviewOverlayKeys` and records them on `PreviewInfo` /
  `PreviewResult` and the `started` lifecycle log; `startServer` logs
  `preview configuration overrides active: …`; and the agent-preview transcript
  and preview API response name the keys.

The user-facing explanation, precedence, and copyable example live in
[`user-docs/configuration.md`](../user-docs/configuration.md#preview-only-overrides).

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
