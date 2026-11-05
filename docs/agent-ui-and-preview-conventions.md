# UI, runtime and preview conventions — full text

Long-form versions of the conventions `AGENTS.md` summarises (moved verbatim on
2026-11-05 to keep `AGENTS.md` under 30 KB; see `docs/agents-md-size.md`).

## UI conventions

- **Dropdowns:** Use the custom styled dropdown component for every new
  dropdown in the UI. Never use default, unstyled `<select>` elements.
- **Confirmations and tooltips:** Never use native browser `alert()`,
  `confirm()`, or `prompt()` for app actions. Use the shared, designed dialog
  components in `src/ui-app/src/components/ui/dialog/` and the existing modal
  styles. Never add a native `title` tooltip for new UI explanations; use a
  styled tooltip or popover that matches the app, supports keyboard focus, and
  remains usable on touch screens.
- **Areas are comma-separated, never `+`.** A task's `area` is a per-repo
  vocabulary (`[[areas]]` in repoos.toml merged with every
  `[[preview.targets]]` area), and one task may carry several: write
  `area: web` or `area: [web, core]`, i.e. `repoos new/update --area web,core`.
  The legacy `server + ui-app` spelling parses only so old files read until
  the one-time migration in the server rewrites them (#0583); nothing new may
  produce it. Agents picking an area for a task should pick from the
  vocabulary when one exists and say so when none fits.
- **Drawer / panel forms:** New creation drawers (New task, New story, New
  input, and future panels) must use the shared dialog components
  (`ui/dialog/*`, body-teleported) and the global form classes in
  `src/ui-app/src/style.css` — `field`, `btn-row`, `ff-textarea`,
  `ff-done`, `shot-dropzone`, `ff-notice`, `ff-error`, and related `ff-*`
  helpers — instead of bespoke colors, borders, or spacing in a component's
  `<style scoped>` block. Extend `style.css` when a variant is missing.
- **Pages use the full main width.** Standard nav views (board, tasks,
  checks, settings, …) span the whole `.main` pane — no page-level
  `max-width` or centering margin on a view's root. Narrow/centered layouts
  are for deliberate exceptions (login/auth, modals); keeping a readable
  line length on inner prose (`max-width: NNch` on one paragraph) is fine.
  Standard page roots also fill the available `.main` height. Keep bottom
  clearance on the actual scrollport with `--page-bottom-inset`, rather than
  padding the pane and shortening its visible area. Narrow layouts that switch
  to normal flow must keep their routed root scrollable and retain the shared
  bottom inset at the component’s own flow breakpoint.
  See the `.main` comment in `src/ui-app/src/style.css` (#0602, #0951).
- **Table-like label/value rows use aligned columns.** Any UI that renders
  repeated rows of labeled fields (a `dl` of `dt`/`dd`, or label+value pairs
  — no literal `<table>` required) must use an aligned two-column layout:
  labels share one fixed-width column, values align in the second, row
  spacing is consistent row to row, and multi-value content wraps inside the
  value cell — never under the label. Use the shared `.kv-rows` utility in
  `src/ui-app/src/style.css` (plus `.kv-wrap` on multi-value cells) when the
  same layout appears more than once, tuning `--kv-label-w` per surface;
  keep component specifics in scoped styles on top (#0623).

- **Any `position: fixed` or fullscreen overlay added to a component MUST be wrapped in `<Teleport to="body">` (or use a Radix `DialogPortal`, which does the same).** Without it, the overlay is trapped inside the drawer's stacking context and becomes unscrollable, unclickable, and unselectable. This applies even when the CSS looks correct — `position: fixed` does not escape `transform`/`will-change`/`overflow: hidden` ancestors.
- **A body-teleported floating layer MUST carry `data-overlay-layer` (#0575).** While any modal dialog is open, Radix puts `pointer-events: none` on `<body>`, so an unmarked layer is click-transparent: the click falls through to the side panel, its inline title editor, or a board card behind it — and the panel behind reads that click as "outside" and dismisses itself. The shared dialog content and scrim set the attribute for you (`components/ui/dialog/layer.ts` gives one id to both, so scrim-click-to-dismiss still works); a hand-rolled `<Teleport>` overlay (banner, confirm, search, toast, …) must set `data-overlay-layer="floating"` on its root. `style.css` turns the attribute into `pointer-events: auto`. Add it to the root *and* the scrim, never to a click-through decoration (a tooltip, a highlight outline).

## Runtime: Bun

- **Runtime: Bun. Node is only the fallback for machines without Bun.**
  Every `repoos` command re-execs under Bun when it's installed, `bunfig.toml`
  (`[run] bun = true`) runs `package.json` scripts and the Node-shebang tools
  they call on Bun, and the install launcher execs Bun directly. When you add
  or change anything that runs code:
  - `bun <file>`, `bun run <script>`, `bunx <tool>`, `bun -e` / `bun -p`.
    Not `node <file>`, `npm run`, `npx`, `node -e`.
  - New scripts get `#!/usr/bin/env bun`.
  - Spawning a subprocess: `process.execPath` (inherits the current runtime)
    or `bun`. Fall back to `npm`/`node` only when Bun can't be launched
    (ENOENT/EACCES), never merely because a Bun run failed; a failed build
    is the real result.
  - Keep Node only where Bun genuinely may be absent, and say why in a
    comment: the CLI entry shebang (npm installs), the launcher's fallback
    branch, `scripts/run-tests.mjs` (runs under `npm test`, then re-execs onto
    Bun), `REPOOS_RUNTIME=node` / `just test-node`, and test fakebins that
    imitate third-party CLIs.
  - If Bun ever produces different output from Node for a tool, measure it
    and write the finding into `docs/architecture.md` before choosing Node.
    Vite's UI bundle, for example, differs cosmetically and was verified
    equivalent.
  Background: `docs/architecture.md` (Runtime).

## Tests, build, layout

- Tests: `bun run test` (vitest), never bare `bun test`. Bun's own test runner
  will pick up the same `*.test.ts` files and mostly work, but its `vi` shim is
  missing pieces like `vi.stubGlobal`/`vi.unstubAllGlobals` — those tests then
  fail with `TypeError: vi.stubGlobal is not a function`, which looks like a
  real regression but is just the wrong runner.
  `bun run test` is `scripts/run-tests.mjs`: a two-pass wrapper that runs the
  bulk suite at the configured pool size, then the latency-sensitive suites
  (`boot-timing.test.ts`) alone at one worker — with `REPOOS_STRICT_TIMING=1` —
  so their absolute wall-clock ceilings aren't blown by pool contention.
  In `boot-timing.test.ts` only the **wall-clock** test skips without
  `REPOOS_STRICT_TIMING=1`, so a raw `bun run test:vitest` (single-pass) or an
  ad-hoc `vitest boot-timing` can't produce a spurious timing failure. Its
  sibling — the #0330 boot-ordering test — deliberately does *not* skip: it
  makes no wall-clock claim, so it runs everywhere. Run the file directly with
  `REPOOS_STRICT_TIMING=1 bunx vitest boot-timing` (`bunx`, not `npx` — this
  repo defaults to Bun everywhere; a bare `npx` on this machine resolves to a
  Node-based npx binary, which is fine for most single-file runs but defeats
  the point for a *latency*-sensitive suite like this one). Extra args
  (`--changed <ref>`) forward to both passes.
  Coverage is deliberately opt-in so routine checks do not pay its extra cost.
  Run `bun run test:coverage` weekly, before releases, or on demand; it runs the
  full wrapped suite with V8 coverage and enforces the baseline thresholds in
  `src/ui-app/vite.config.ts`. Changed-path runs skip coverage because a partial
  report would be misleading. Text summary and HTML/JSON reports go under the
  ignored `coverage/` directory. The initial global floors are a measured
  baseline, not a quality target; ratchet them upward as critical paths gain
  behavior-focused tests.
- Language: TypeScript, NodeNext modules — imports use `.js` extensions even
  for `.ts` source (this is correct, not a bug).
- Build: `bun run build` (runs `tsc` then copies UI assets into `dist/ui/`).
  Staleness-aware by default (#0377): it skips when `src/` is unchanged since the
  last build (~0.1s vs ~5s), so a no-op build is cheap. Force a rebuild with
  `--force` or `REPOOS_FORCE_BUILD=1`; the raw pipeline is `bun run build:raw`.
- Source layout: `src/core` (engine), `src/server` (HTTP + SSE), `src/cli` +
  `src/commands` (CLI), `src/ui-app` (the Vite + Vue 3 SFC web UI).
- UI sitemap: routes are declared in `src/ui-app/src/router.ts` (path → view),
  each view is one `src/ui-app/src/views/*View.vue`, and the left-nav order +
  which links show is in `src/ui-app/src/nav.ts` (some entries are conditional,
  e.g. Releases only appears when a release provider is configured). Context
  (`/repo`, `ContextView.vue`) has Docs, Skills, Discover, and History tabs;
  commit diffs reuse `DiffView.vue` at `/repo/commits/:sha`. To find the
  code behind a screen, grep `router.ts` for the path or `views/` for the name.
  Dialog/modal content is body-teleported, so its CSS lives in
  `src/ui-app/src/style.css`, not the view's `<style scoped>` block.

## Rebuilds, `repoos shot` and previews

- After ANY UI change, rebuild (`bun run build:ui` for speed, or `bun run build`)
  so the worktree build is fresh. Do NOT automatically request a preview to
  verify it — previews are on request from the human, not something you spin up
  as a routine part of finishing a task (#0268).
- **`repoos shot` is the one sanctioned use of the managed preview by the
  engineer**, and only for a UI-visible change. But the engineer no longer has
  to remember to run it (#0594): at handoff the server captures declared
  `## Shots` itself (targets resolve like the CLI: changed paths, then area,
  then the default command), and without declarations it still captures one
  captioned `/` shot per target the diff's paths touch (test files are not
  UI evidence, #0603) — a tests-only or task-note diff records a visible
  `shots: skipped` instead, and a missing Playwright shows up as a visible
  `shots: skipped` note, never a failed handoff. The engineer's job
  is to DECLARE what a review should see — use
  `repoos update <id> --shots '<JSON list>'` to write a validated, fenced
  `## Shots` section (entries take `target`, `route`, optional
  `selector`, optional `state` fixture (`closeOut:active`, `card:doneError`,
  `board:withReviewTask`) for conditional UI, optional ordered `steps`
  (`click`/`fill`+`text`/`waitFor`/`waitMs`, plain CSS selectors), an
  optional `highlight` CSS selector outlining what changed, and a human
  `label` naming the change), usually 1–3 entries showing the changed
  screens. Prefer routes and `state` fixtures over brittle `waitFor` steps on
  an empty preview board. Every shot is captioned with why it exists
  (`declared: <label>` / `auto: matched <glob>`); a docs-wording-only diff
  captures nothing without a declared route (#0603). **Shot hygiene (#0613,
  #0830):** on a **declared** shot, a missing `highlight`/`selector`/step
  target (`click`, `fill`, `waitFor`, `hover`) **fails handoff** with a
  per-shot message; auto-matched captures still record a miss as a warning only
  (#0743). Tooltip/hover shots need a `hover` or `click` step plus a `state`
  fixture. Duplicates with
  the same target/route/steps/selector collapse to one capture. **Target
  support (#0866):** a declared `state` fixture (or an app route such as
  `/settings` or `/work?task=…`) only renders on the app target — `default`
  for the main RepoOS app. Naming the Docs site or another content target for
  such a shot is rejected when you declare it (`repoos update --shots`), and a
  shot that still resolves there fails handoff with the target named instead of
  banking a wrong-screen capture. An omitted `target` on an app route/state
  defaults to the app target, not whichever target the diff matched first. A
  target that serves its HTML shell for an app module (the VitePress MIME
  error) is reported as **route not served by this target**, and a `state`
  fixture that never rendered (a board where a drawer was declared) is a
  failed shot, never a pass. **Loading and
  stale captures (#0755):** reach a populated view with a `route` or `state`
  fixture, not a `steps` click on a placeholder selector (`data-task-id "9999"`
  and the like) — such a step times out, the capture lands on a loading state
  ("Loading changes…"), and it is reported as a failed step (`check`), never
  `matches`. Each handoff capture also stores the tree it ran on; when that tree
  differs from the branch HEAD the review will use, the Changes tab flags the
  capture **Stale capture** and no shot is shown as `matches` — re-run the
  handoff capture on the final tree before requesting review. **Whole-window
  default (#0613):** declared shots capture the whole visible viewport
  (`fullPage: false`) with changed elements outlined via `highlight`;
  `selector` (element crop) is the exception, `fullPage` stays off. For tabbed
  views prefer `?tab=<id>` routes (e.g. `/agents?tab=detected`) over click
  steps; a task drawer is reached the same way — `/work?task=<id>&tab=changes`
  opens that task's drawer on the Changes tab (#0755). `--shots` accepts JSON without Markdown fences, validates every entry,
  and edits only that section. The older `--section Shots --section-body` form
  requires a fenced JSON list and rejects malformed content. A full `--body` replace that drops
  Problem / Desired UX / Acceptance criteria / Notes for AI is refused unless
  `--force` is passed. Manual `repoos shot` remains the tool for checking
  your own work; an engineer-made capture pre-empts the automatic one.
- **Previews are server-owned — never run `repoos serve` yourself.** RepoOS owns
  the control-plane port and every preview port. Preview requests are the
  human's to make: the human requests a preview manually from the UI when they
  want to see a change. The engineer agent does NOT auto-request one before
  handoff. If the human explicitly asks you to verify something the way a
  browser would see it, request this task's managed preview by emitting the
  exact signal line (idempotent — repeat requests return the same task preview,
  and no localhost/curl is needed):
  `::repoos-preview-request::`. RepoOS validates the request against your live
  run, starts the preview from your worktree, probes it server-side, and records
  the preview URL and probe result in your task transcript. Direct `repoos
  serve` attempts from agent processes are rejected; the preview is reaped when
  the task leaves active/review.
  **Previews are on-demand only, capped at ONE running at a time (#0271).**
  Nothing auto-launches a preview anymore — not on a task entering `review`,
  not at server boot for tasks already in review. Requesting yours may evict
  whatever preview was running for a different task (FIFO); that's expected,
  not a bug — if you need to re-verify something you checked earlier and the
  slot has since moved on, just emit the signal again.
  **This server-side probe is a plain HTTP request to the target's configured
  readiness path (`/` unless the target overrides it) — it does not open a
  browser and does not require login.** Auth
  being enabled is not a reason to skip verification or fall back to a
  component-level unit test instead: emitting the signal and reading the probe
  result from your transcript confirms the change serves, with no OTP involved.
  If a task genuinely needs deeper interactive verification — actually clicking
  through the logged-in UI, not just confirming it serves — log into the
  preview with the dev backdoor instead of a real email OTP you have no inbox
  for. See **Dev login** below for the exact email and code.
- The AGENTS.md *template* that `repoos init` scaffolds into other repos lives in
  `src/commands/init.ts` as a string literal. It is NOT this file. Editing it
  ships to every future `repoos init`, so change it deliberately and don't confuse
  it with this repo's own AGENTS.md.

## Dev login and the auth-less dev server

## Dev login (skip the email OTP)

Local `repoos serve` and task previews run with auth **on** by default, but you
never need a real inbox to get past the login screen:

- **Email:** any allowlisted user. Use `hello@repoos.org` — the `bootstrapAdmin`
  in `repoos.toml`. The backdoor does **not** let you log in as an arbitrary
  address; the email must already be allowlisted.
- **Code:** the value of `REPOOS_AUTH_DEV_BACKDOOR_CODE`, set in the gitignored
  `.env` at the repo root — run `grep REPOOS_AUTH_DEV_BACKDOOR_CODE .env` to read
  it. If login fails, that file is the source of truth: the value may have
  changed, or `.env` may be missing entirely (`.env.example` shows the key with
  an empty placeholder). It is env-var only, never a `repoos.toml` key, and
  never honored when `NODE_ENV=production`.

This replaces only the OTP step; the resulting session is otherwise normal, and
the same code works against any locally-served instance (a task preview, or a
`repoos serve` a human is already running). Wiring: `src/core/config.ts` reads
the env var into `config.auth.devBackdoorCode`, and `src/server/routes/auth.ts`
accepts it in place of the OTP. Background: `docs/native-auth.md`.

Task-runner agents: for "does it serve?", still prefer the server-side probe
(`::repoos-preview-request::`, no login at all); reach for this dev login only
when the human explicitly wants the logged-in UI clicked through.

### Auth-less dev server (interactive sessions: skip login entirely)

Logging in on every session is annoying, and the backdoor puts a real session on
the human's server. `repoos.toml` already has a preview-only override
(`[preview.auth] enabled = false`, #0464); to get the same thing on demand:

```bash
just serve-noauth [port]      # default 7272; http://127.0.0.1:<port>, no login
```

It runs `REPOOS_PREVIEW_CHILD=1 bun dist/cli/index.js serve --preview-overrides
--port <port>` after a staleness-aware build. It binds 127.0.0.1 only, never
reaps the real server, and the real one on :7171 keeps requiring login. Stop it
with `pkill -f "serve --preview-overrides --port <port>"` when done. Use it for
browser-tool verification instead of the OTP backdoor.

**Run it from a task worktree or a scratch worktree — never from the checkout the
real `repoos serve` is serving.** Two servers on one root both watch the same
`work/` files, so a task entering `review` spawns *two* reviewers, and the second
server's watchdog (`runner.isRunning` is per-process) sees every active task as
dead and flags it. The recipe refuses when a non-preview server is already
serving the current directory. Check the directory first: a failed `cd` silently
leaves you in the main checkout, and the server then runs against it (this
happened on 2026-09-27, briefly, with no lasting effect). Confirm with the
server's startup log line (`root` and `mode: "preview"`).

