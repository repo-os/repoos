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
- **Companion services (#0681)** for full-stack previews: repeatable
  `[[preview.services]]` tables (siblings of `[[preview.targets]]`, not nested)
  declare extra processes — typically an API — each with its own OS-assigned
  port. A target lists them with `services = ["API"]`. Every service's port and
  URL are passed to all commands by placeholder (`{api.port}`, `{api.url}`; the
  token is the service name lowercased with non-alphanumerics collapsed to `_`)
  and by env (`REPOOS_PREVIEW_API_PORT`, `REPOOS_PREVIEW_API_URL`). Services
  boot and become ready **before** the main command starts, so a web dev server
  can proxy `/api` to the **branch's** API instead of the primary checkout's.
  An unknown service name fails at start time with a clear error. The long-lived
  control-plane server also re-reads `repoos.toml` on disk (and after a merge
  to the primary branch) via `ConfigWatcher`, so new targets appear without a
  restart; preview children do not watch config.
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

Task browser capture can be assigned to `remoteValidation.browserCaptureMode`
in Settings → Performance: `local`, `runner when available`, or `runner only`.
Local remains the default until runner images advertise WebKit and a real
artifact round trip has been proven. Remote capture builds and serves the task
inside the runner, then returns the ordinary shot files and verification
record for the existing Changes tab and activity log. It uses the same fixture
resolver and shot choreography. A runner fallback is recorded visibly;
`runner only` fails with the runner error. Declared shot target misses continue
to block handoff. The interactive Preview button remains on the local
control-plane preview path. See `docs/remote-shot-capture.md` for transport and
security details.

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
optional ordered `steps` (`click` / `fill`+`text` / `waitFor` / `hover` / `waitMs`,
plain CSS selectors). Routes and selectors only — no framework knowledge.

### Evidence shots for non-web targets (#0761)

The web path above always boots a URL and drives a browser. A repo whose product
is a **native macOS app, a mobile app or a desktop app** has no dev server and no
route to load, so its capture target is a COMMAND instead
(`[[shot.targets]]`, `src/core/shot-command.ts`). The command runs in the task
worktree and renders image files offscreen; RepoOS creates a fresh, gitignored
directory, hands its path to the command as `REPOOS_SHOT_DIR` (and the worktree
as `REPOOS_WORKTREE`), and collects every image matching the target's
`outputGlob`. Nothing is ever written to a tracked path by default, so evidence
images are never committed to git — the same rule the web shots follow.

A capture target looks like:

```toml
[[shot.targets]]
name = "macOS app"
areas = ["mac"]
paths = ["Sources/Divot/**"]
command = "swift test --filter RenderShots"
outputGlob = ["*.png"]
requires = "xcrun"
timeoutMs = 120000
```

Resolution mirrors the web path exactly: a changed file matching `paths` selects
the target, then the task's `area`, then an explicit `--target`. Web targets are
tried first at each step, so a repo that declares both keeps its existing web
behavior. It is a general model — the command is user-configured and nothing is
hard-coded to Apple/Android tooling.

**Platform recipes.**

- **Native macOS — offscreen render in a test.** Add a test that renders the view
  hierarchy to a PNG without a window, then point the target at that test:
  ```swift
  // In an XCTest: render the view into a bitmap and write it to REPOOS_SHOT_DIR.
  let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds)!
  view.cacheDisplay(in: view.bounds, to: rep)
  let png = rep.representation(using: .png, properties: [:])!
  try png.write(to: URL(fileURLWithPath: "\(ProcessInfo.processInfo.environment["REPOOS_SHOT_DIR"]!)/main.png"))
  ```
  ```toml
  [[shot.targets]]
  name = "macOS app"
  areas = ["mac"]
  paths = ["Sources/Divot/**"]
  command = "swift test --filter RenderShots"
  outputGlob = ["*.png"]
  requires = "xcrun"   # `swift` is enough on its own; requires is optional
  ```
  A `.app` window can also be captured with `screencapture -l <windowid> "$REPOOS_SHOT_DIR/x.png"`
  (`requires = "screencapture"`), though the offscreen render is the deterministic
  choice in CI.
- **iOS simulator.** Boot a simulator, then:
  ```toml
  [[shot.targets]]
  name = "iOS app"
  areas = ["ios"]
  paths = ["ios/**"]
  command = "xcrun simctl io booted screenshot \"$REPOOS_SHOT_DIR/home.png\""
  requires = "xcrun"
  ```
- **Android emulator.** Boot an AVD, then:
  ```toml
  [[shot.targets]]
  name = "Android app"
  areas = ["android"]
  paths = ["android/**"]
  command = "adb exec-out screencap -p > \"$REPOOS_SHOT_DIR/home.png\""
  requires = "adb"
  ```

**Declaring and skipping.** Declare a command shot in `## Shots` exactly like a
web one — `target` (or `label`) with no `route`:
`[{"target": "macOS app", "label": "Menu bar open"}]`. Page-only fields (`route`,
`selector`, `highlight`, `steps`, `state`, `assert`) are dropped gracefully for a
command target: they would be meaningless without a page. The provenance caption
is the same (`declared: <label>` / `auto: matched <glob>`), duplicate collapsing
and the plan-fingerprint/tree stale-capture checks work identically, and
`repoos shot --target "macOS app"` runs the command from the CLI too.

**Choosing which images a command capture produces (#0769).** A command's
`outputGlob` may match a whole fixed snapshot set — the bar and every popover —
so an automatic capture attaches dozens of images and the one that shows the
change can be missing entirely (observed in the Divot repo: 27 shots, none of
the feature under review). A declared entry hands the selection to the command
instead, with three command-only fields:

- `env` — extra environment variables for the command, keys plain identifiers
  (`{"DIVOT_SNAPSHOT_ONLY": "worldclock"}`). A value is passed through the
  **environment only** — never interpolated into the command string — so a
  declared value can never be shell-evaluated.
- `args` — extra tokens appended to the command line, each shell-quoted as data.
- `glob` — a glob narrowing which produced files become **this** shot (relative
  to `REPOOS_SHOT_DIR`), e.g. `"*worldclock*.png"`.

Several entries may name the same target with different `env`/`glob` and their
own labels; each runs the command and its images are listed under its label.
Identical entries still collapse. The fields are rejected for a **web** target
(they only make sense for a command) with a clear error, and `repoos shot
--target <name> --env KEY=VAL --glob <glob>` does the same selection ad hoc.

The project's command has to honor a filter variable for `env` to narrow
anything — a native-app recipe:

```swift
// In the offscreen-render XCTest, read the filter and render only that view.
let only = ProcessInfo.processInfo.environment["DIVOT_SNAPSHOT_ONLY"]  // e.g. "worldclock"
let views = only.map { [filteredView($0)] } ?? allPopovers()
for v in views { /* render each into \(REPOOS_SHOT_DIR)/\(name).png */ }
```

```toml
[[shot.targets]]
name = "macOS app"
areas = ["mac"]
paths = ["Sources/Divot/**"]
command = "swift test --filter RenderShots"
outputGlob = ["*.png"]      # the whole snapshot set
```

```json
[
  { "target": "macOS app", "label": "World clock popover",
    "env": { "DIVOT_SNAPSHOT_ONLY": "worldclock" }, "glob": "*worldclock*.png" }
]
```

**The automatic-capture cap.** An *undeclared* command capture keeps today's
whole-`outputGlob` behavior but is capped at `shot.maxAutoShots` images per task
(default `12`, a Settings key), so a task that merely touches the paths does not
flood the Changes tab. Beyond the cap the extra images are dropped and the task
records a visible `N more not shown (cap N per task)` note pointing at the
`glob` declaration. A declared entry is **never** capped — the engineer asked
for exactly those images.

A command problem is NEVER a failed handoff: a missing `requires` binary, a
timeout (stdout/stderr tail recorded), a non-zero exit, or a run that produced no
images is a visible `shots: skipped — <reason>` / `shots: failed — <reason>`
activity note. A command that exits non-zero but still wrote image files has
those files collected anyway (a render that warns on stderr but succeeds is
common), with a visible warning naming the exit code — so a partial failure can
still produce shots and is always recorded, never silently. When a repo has
command targets but no target covers the changed
paths, the skip message says so and points at the `[[shot.targets]]`
declaration — no more "matched only documentation content" for a native app.

**Evidence record for command captures (#0765).** The handoff gate
(`ui-handoff-gate.ts`) handles BOTH kinds of entry. A web entry is driven in a
browser and checked for console errors, the landed route and declared
assertions; a command entry has no page and no console, so the gate runs the
command and records an equivalent evidence record in the same
`.repoos/ui-verification/<task-id>.json`: the target, the command and its cwd,
the process exit status, the tail of the command's stdout/stderr, and every
image it produced (with size and path). It records the same tested-tree identity
(`sourceIdentity`) and plan fingerprint, so stale-capture detection works for
command captures exactly as for web ones — a capture whose tree differs from the
reviewed HEAD is reported STALE, never as verification. A command problem stays
a visible warning and never blocks handoff, but it is always in the record so a
reviewer can see it.

Because a command-target task has no browser page, the reviewer prompt tells the
reviewer that browser UI verification does **not** apply, names the evidence
record (not a "console log"), and the mechanical console-error check is
`skipped` rather than `not run` — so a native task can never be blocked on a
browser console record it cannot produce. A task with no capture plan at all is
told the same; `shots: skipped` is correct behavior, not a capture failure.

**Shot hygiene (#0613, #0734, #0830).** When a **declared** shot's `highlight`,
`selector`, or step target (`click`, `fill`, `waitFor`, `hover`) is missing at
capture time, the handoff gate still saves the screenshot but **blocks handoff**
with a per-shot `[missing-target]` message (route, step, selector). Tooltip and
popover shots need a `hover` or `click` step on the trigger plus a `state`
fixture that seeds the data. **Auto-matched** (undeclared) captures keep the
lenient behaviour from #0743: a miss is a visible warning only. Console errors,
failed same-origin requests, overflow, blank captures, wrong-route redirects,
and failed required `assert` entries still block. Prefer a `state` fixture
(below) or a `?tab=` route over brittle `waitFor` steps when the UI only exists
in a particular board state. The
browser's FINAL route after any
redirect is also compared to the declared route — a login bounce or a
client-side guard that lands elsewhere fails the shot rather than passing a
screenshot of the wrong page. Declared shots with the same `target` + `route` +
`steps` + `selector` + `assert` + `state` + `theme` (plus `env`/`args`/`glob`
for command targets) are collapsed to one capture, with `highlight`
selectors merged (comma-joined), so near-duplicates become one capture.

**Meaningful assertions (#0734).** A declared entry may carry an `assert` list
naming what the shot must actually prove — not merely that the page was
non-blank:

```json
[{"route": "/reviews", "label": "Review rows", "highlight": ".review-row",
  "assert": [{"selector": ".review-row", "minCount": 1, "label": "review rows present"}]}]
```

Each assertion checks an element count (`selector` + `count`/`minCount`), its
text (`selector` + `text`, or `text` alone against the page body), and may set
`optional: true` to record a best-effort outcome without blocking. Every
non-optional assertion is evaluated against the live captured page; a failure
blocks the handoff with the exact selector/text and the capture URL. This is
what lets a task assert "review rows are populated" or "the Settings input is
editable" instead of relying on a generic nonblank screenshot. It does not
replace the reviewer's reading of the acceptance criteria — screenshot
assertions cannot establish every semantic requirement.

**Preview board fixtures (#0743).** A declared entry may set `state` to a named
fixture the preview applies before capture (preview builds only, via
`?shotState=` on the capture URL):

- `closeOut:active` — integration pipeline bar visible (active close-out)
- `closeOut:stalled` — fixture task card with the stalled Cancel/Retry actions (#0778)
- `closeOut:uploading` — active close-out mid bundle upload, card shows the
  upload progress line (`#9999` fixture task, #0782)
- `closeOut:remoteTests` — active close-out in the remote test run; card shows
  the "remote tests" step heartbeat and elapsed time, not stalled (`#9999`
  fixture task, #0799)
- `card:doneError` — review card with done-error footer (`#9999` fixture task)
- `card:humanStep` — ready card flagged by the decision-model human-step check,
  showing the model's bounded explanation (`#9999` fixture task, #0804)
- `card:checkpointRecovery` — review fixture card mid post-handoff checkpoint
  recovery, so the card shows the **re-reviewing checkpoint…** hint (#0834,
  `#9999` fixture task)
- `drawer:activeRequirements` — active fixture task with requirement sections
  so the task drawer shows **Update requirements** on the spec header (#0817,
  `#9999` fixture task)
- `board:startWorkPending` — ready fixture card `#9999` on `/work` with Start
  work in flight (`Starting…` hint and disabled footer, #0822)
- `drawer:startWorkPending` — same pending state with the task drawer open on
  `#9999`
- `settings:birdQuickTrail` — Settings activity-animation preview seeded to
  **Bird quick trail** (#0822)
- `settings:rgbKeystorm` — Settings activity-animation preview seeded to
  **RGB keystorm** (#0833)
- `settings:wheelieCourier` — seeded to **Wheelie courier** (#0833)
- `settings:booSwoop` — seeded to **Boo swoop** (#0833)
- `settings:pumpkinSpell` — seeded to **Pumpkin spell** (#0833)
- `board:withReviewTask` — board shows a review-column fixture card
- `board:cardChips` — multi-area human-assigned card with seeded diff stats,
  so the area, human and file chips all render (#0776, #0795)
- `card:noChanges` — ready human-assigned card with a branch and zero diff
  stats, for confirming the card has no empty file-change chip (#0847)
- `dev:failed` — Dev page shows a failed target with its failure summary (#0775)
- `editor:unconfigured` — clears the configured editor so the fallback
  "Set editor in Settings → General" hint renders instead of the
  "Open in editor" button (Task drawer Spec row, Context doc viewer,
  failed-tests list, #0805)
- `budget:paused` — Agents → Budget Controls with one whole-agent pause and one
  per-model pause, each with a reason and a future resume date, so the Paused
  chip and Resume controls render (#0850)

**Preview Settings saves (#0828).** A preview child (`REPOOS_PREVIEW_CHILD=1`)
applies curated and raw config saves to a gitignored cache-dir overlay only —
never the worktree's tracked `repoos.toml` — so autosave during shot capture
cannot dirty a task branch. Config fixtures such as `settings:birdQuickTrail`
seed the Settings form after `config.load()` via `formSyncGeneration`.

**Light and dark captures (#0782).** A declared entry may set `theme` to
`"light"` or `"dark"`: the capture pins the page's stored theme before the
screenshot (the same two values the contrast audit writes —
`localStorage.repoos.theme` plus the resolved `data-theme`), so a criterion
like "visible in light and dark themes" gets one capture per theme on the same
route. `theme` participates in duplicate collapsing, the plan fingerprint and
`sameDeclaredShot`, so the two captures survive as separate evidence and a
changed declaration forces a fresh capture. A driver that cannot apply the
theme records a visible warning instead of passing a wrong-theme frame.

Concurrent handoff verifications queue for the single preview slot instead of
evicting each other; a mid-capture preview disconnect retries once on a fresh
preview.

**Stale-capture reuse (#0734).** An automatic capture is reused on a
re-handoff only when it is bound to the SAME capture plan and the SAME tested
tree: the shot manifest records a plan fingerprint (target/route/selector/
steps/highlights/assertions/state/theme) and the worktree HEAD sha, and a plan
or tree that
changed forces a fresh capture. A metadata note alone never stands down a
capture whose declaration changed — that was the #0720/#0727 stale-evidence
failure. A capture taken before #0734 (no fingerprint) is deliberately NOT
reusable, since it cannot be tied to the current plan.

While a task is in review, **Refresh evidence** in the Changes tab or
`repoos verify <id>` re-runs the browser and command capture plan and writes a
new UI-verification record for the current worktree HEAD. The server refuses
the action if the worktree is dirty or an agent/close-out is active. Refreshes
replace prior automatic captures in gitignored storage and do not edit task
Markdown. When a capture command writes outside `REPOOS_SHOT_DIR`, the refresh
restores the tracked files and removes the untracked files it created, so the
worktree stays clean either way; the response lists what was restored. HEAD
movement that is only `work/*.md` task bookkeeping (status flips, review
counters) does not make the refreshed record stale.

When a reviewer marks **`EVIDENCE-GAP-ONLY`** (code is fine, shots or
verification are not), RepoOS runs the same guarded re-capture automatically,
does not auto-bounce the engineer, and does not increment `review_rounds`. After
two failed repair attempts it flags `evidence-gap-exhausted` for a human. See
[`docs/review-evidence-gaps.md`](./review-evidence-gaps.md).

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

task drawer's UI changes sub-tab, while the task is `active` or in `review` —
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
  selector/steps, so ALL entries sharing the shot's label/route/target are
  removed (a leftover would let a re-handoff recapture the deleted evidence)
  and the response carries a warning naming how many went. (Review rounds 3
  and 4 pulled opposite ways here: keeping them erased distinct declarations
  but resurrected evidence; resurrection was judged the worse failure.) Exact
  hand-added shots remove only their own declaration's twins.
- Ordering keeps add and delete from half-applying (review round 5). Add
  parses the current `## Shots` BEFORE capturing, so a malformed list is a 400
  with no orphan image. Delete writes the task file first and removes the
  image second: a failed or invalid task-file update is a real error (500/400)
  with the shot untouched, never a 200 that leaves a declaration to resurrect
  it. Both routes only work while the task is `active` or `review`; Add
  rechecks that after the 5-30s capture and, if the task moved on, discards
  the image and returns 409 without touching the task file.
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

### Teardown rules (#0853)

A preview is only valid while its task is `active` or `review` and not
archived. It is stopped, within a short grace period, by any of:

- a status transition out of `active`/`review` (done, ready, abandon) — the
  status-change hook stops it immediately;
- archiving the task — the archive action stops the preview instead of
  refusing;
- the periodic safety sweep (30s) — covers a missed file-watcher event or a
  preview that finished booting after its task had already left the previewable
  states;
- a manual Stop, or another preview taking the one slot.

Tearing down sends SIGTERM to the recorded process group (the build shell and
the server it launched), then SIGKILL after a 400ms grace period. It only ever
signals PIDs and process groups RepoOS recorded when it spawned the preview —
never a process matched by name or command line. The teardown is logged both on
the server's stderr and on the task's log as:

```
preview for #0001 stopped (task done)
```

Evictions log `preview for #0001 stopped (evicted to keep concurrent previews
at 1)` plus the `evicted` lifecycle line.

### One preview at a time (#0198/#0853)

`MAX_PREVIEWS` is 1. A new request evicts the previous holder — oldest first —
before its own child spawns. The cap counts **starts still in flight**, not just
registered previews: a preview is recorded immediately after spawn (with
`starting: true`) and becomes usable only after readiness, so two concurrent
starts for different tasks cannot both pass a registry-only check. Capacity
decisions are serialized, and a stop/eviction during a long build cancels that
start and kills the child instead of letting it register late.

### Restart and reload adoption

The registry is durable. On boot (including a reload handover wrapped by
`REPOOS_RELOAD=1`) the replacement reads it and reconciles each entry against
the current tasks:

- a preview whose task is still `active`/`review` is **adopted** in place: it
  keeps serving, stays stop/restart-able, and the cap/teardown rules keep
  applying (there is no `ChildProcess` handle, so PID liveness is the truth);
- a preview for a done, archived, or missing task is **stopped**;
- if more than one survived, the oldest are stopped until the cap holds.

On a reload the outgoing server therefore stops only starts that are still
booting; it leaves registered previews running for the replacement to adopt. A
real (cold) shutdown still tears everything down.

**Windows:** `detached` stays `false` there (no portable process-group
equivalent), so stopping a preview only signals the immediate `cmd.exe` child —
a shell command with its own subprocess tree (`&&`-chained scripts, an `npm`
wrapper spawning a real dev server) can leave a grandchild running with the
port still bound after "stop." Not a regression from the previous behavior
(the old `repoos` fallback had the same limitation), just a limit worth knowing
before relying on previews for a Windows-hosted repo.
