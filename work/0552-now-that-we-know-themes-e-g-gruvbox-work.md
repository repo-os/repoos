---
updated_at: "2026-09-27T16:04:17Z"
review_passes: 1
id: "0552"
title: Add a gruvbox theme switcher to the user-docs site and carry it over from the landing page
type: feature
status: review
priority: p2
area: docs
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-a-gruvbox-theme-switcher-to-the-user
created_at: "2026-09-27T14:36:30Z"
last_check_failure: "[object Object]"
---
## Problem

#0547 shipped the landing page's two-axis theme switcher: a design theme
(`classic` | `gruvbox`) crossed with an appearance (`dark` | `light`), persisted
under `repoos-ui-theme` / `repoos-theme`, and shareable via `?theme=` and
`?appearance=` (alias `?mode=`) — `https://repoos.org/?appearance=dark&theme=gruvbox`
is a real, supported link.

The user-docs site (`user-docs/`, VitePress, docs.repoos.org) is still on the
pre-#0547 world. `user-docs/.vitepress/theme/custom.css` encodes exactly one
design identity in its `:root` / `.dark` token blocks, and the only control a
reader gets is VitePress's built-in dark/light appearance toggle. So the person
who deliberately chose gruvbox on the landing page clicks "Docs" and lands in
blue-cyan Classic. The switcher is in the landing nav — the exact place the
choice is made — and every one of the four `https://docs.repoos.org` links in
`landing/src/App.vue` crosses the boundary carrying nothing.

Nothing will fix this on its own: `user-docs/` is a standalone sibling project
(own `package.json`, own lockfile, no bun workspaces — the same pattern as
`landing/` and `mobile/`), so neither the storage keys nor the resolution logic
are shared, and `repoos check` treats the two trees as independent build steps.

## Desired UX

- The docs site gets the same two-axis model as the landing page: a design theme
  (Classic, Gruvbox) and an appearance (dark / light), one switcher, repaints
  instantly, no flash of the wrong theme on load.
- Gruvbox on the docs site is recognisably gruvbox, not Classic recoloured: warm
  charcoal in dark, cream in light, hairline warm borders, flat opaque panels,
  no neon glow, tight 4–8px radii — the same palette the landing and the app
  already ship, re-expressed in VitePress's `--vp-*` vocabulary.
- **The hand-off works**: from `https://repoos.org/?appearance=dark&theme=gruvbox`,
  clicking any "Docs" link arrives at docs.repoos.org already in gruvbox/dark.
  The round trip is stable in the other direction too — the docs' link back to
  `repoos.org` carries the current choice, so bouncing between the two sites
  never silently resets you.
- The docs site also works standalone. Deep-linking
  `docs.repoos.org/getting-started?theme=gruvbox&appearance=light` renders
  gruvbox light immediately, on any page, and the choice persists across a
  reload and across pages.
- Existing readers are unaffected: a first-time visitor with no params and no
  stored choice still gets today's default (dark-first, per
  `appearance: "dark"` in `config.mts`).
- Keyboard reachable, labelled for screen readers, usable from the collapsed
  mobile nav.

## Acceptance criteria

- [ ] Classic and Gruvbox × dark and light all render on the docs site, with
      correct contrast and no VitePress default blue leaking through in any of
      the four combinations.
- [ ] Gruvbox tokens are ported from `landing/src/style.css`
      (`[data-ui-theme="gruvbox"]` and `[data-ui-theme="gruvbox"][data-theme="light"]`,
      which came from `src/ui-app/src/style.css`) and re-expressed as `--vp-*`
      custom properties. Every `--vp-*` token the file declares today gets a
      gruvbox value in both appearances — an unset one silently falls back to
      VitePress's default palette, which is the failure mode to watch for.
- [ ] The existing selector strategy is kept, not restructured: `:root` holds the
      light defaults and `.dark` overrides them (VitePress toggles a `dark` class,
      not `data-theme`). Gruvbox is added alongside as its own blocks.
- [ ] The deliberate exceptions in `custom.css`'s file header survive the port:
      code blocks stay dark in BOTH appearances (`markdown.theme` stays pinned to
      `github-dark` both ways), the brand button keeps its fill, and inline code
      and custom containers continue to follow the theme.
- [ ] The design theme is applied the way the app and the landing page apply it —
      `data-ui-theme="gruvbox"` on `<html>`, attribute absent for Classic — so
      all three codebases read alike. Appearance keeps VitePress's `dark`-class
      meaning.
- [ ] The design theme and appearance both resolve **before first paint**, with no
      flash of Classic. `config.mts` already documents that VitePress injects its
      own `check-dark-mode` script when `appearance` is enabled and that a manual
      class script "would fight the toggle and flash on light mode" — the new
      script must compose with or deliberately replace that behaviour, and the
      comment there is updated to say which.
- [ ] `?theme=` and `?appearance=` (alias `?mode=`) are honoured on the docs site
      using the same normalization rules as `landing/src/theme-resolve.ts`:
      Classic is the absence of `theme`, appearance accepts only `dark`/`light`,
      invalid values are ignored per axis rather than poisoning the other one,
      and an unknown `?theme=` (a future id) falls back to Classic instead of
      rendering an unstyled page.
- [ ] All four outbound links in `landing/src/App.vue` to
      `https://docs.repoos.org` (nav `Docs`, mobile-menu `Docs`, the macos-hub
      link, and the footer/hero link) carry the current design theme and
      appearance, following the same rules `syncThemeToUrl` already applies —
      including omitting `theme` when Classic — and keep whatever path and
      existing query string they had.
- [ ] Choices persist: a theme picked on the docs site survives a reload and
      applies on every other docs page. Blocked or unavailable `localStorage`
      degrades to the default instead of throwing.
- [ ] The switcher is a real control, per this repo's dropdown convention: the
      custom styled component, never a native `<select>`; `aria-label`/`title` on
      each option; keyboard operable; a visible focus ring; works in the collapsed
      mobile nav.
- [ ] There is exactly one appearance control. The built-in VitePress appearance
      toggle is either replaced by the new switcher or wired to write through the
      same resolver — whichever is chosen, two controls fighting over
      `<html class="dark">` is not an acceptable outcome.
- [ ] `cd user-docs && bun run build` (vitepress build) passes, and
      `repoos check` is green including the `user-docs-build` step. No new runtime
      dependencies anywhere (dev deps are fine).
- [ ] `user-docs/README.md` documents the switcher, the two-axis model, and the
      shared `?theme=` / `?appearance=` contract; `landing/README.md` gains a line
      about the hand-off, since it already documents the switcher from #0547.

## Notes for AI

Files to touch:

- `user-docs/.vitepress/theme/custom.css` — the Gruvbox blocks in `--vp-*`
  vocabulary, plus the switcher's own rules.
- `user-docs/.vitepress/theme/index.ts` — a `Layout` slot for the switcher;
  `custom.css` is imported here, so a new component belongs beside it (e.g.
  `ThemePicker.vue`).
- `user-docs/.vitepress/config.mts` — the pre-paint script in `head`, and the
  existing comment about VitePress's `check-dark-mode` script.
- A theme-resolution helper for the docs site (e.g.
  `user-docs/.vitepress/theme/theme-resolve.ts`), mirroring
  `landing/src/theme-resolve.ts`.
- `landing/src/App.vue` — append the current axes to the four docs links.
- `user-docs/README.md`, `landing/README.md`.

Constraints:

- The docs site is a standalone deployable with its own lockfile and no bun
  workspaces. Do not add a workspace, a shared package, or a build-time import
  from `landing/src` or `src/ui-app`. Duplicate the small resolution helper,
  cite `landing/src/theme-resolve.ts` in a comment, and keep the coupling a
  comment — the same discipline #0547 set for the landing.
- Gruvbox is deliberately flat: opaque panels, hairline warm borders, no glow, no
  glass, tight radii. Do not carry VitePress's default shadows or gradients into
  it, and do not port the landing's `--glow-*` / `--shot-shadow` treatment —
  those tokens have no docs-site equivalent and should simply not appear.
- `repoos check`'s theme-contrast guard only reads `src/ui-app/src/style.css`
  (`[check] uiStylesheet`), so the docs site is not machine-checked. The app's
  guard still teaches the relevant lesson: it parses theme blocks line-by-line
  and a `/* … */` comment *between* declarations corrupts the following key.
  Keep comments outside declaration runs so the blocks stay diffable and
  portable to the app.
- The docs site has no test suite and no contrast guard, and the gruvbox values
  come from a palette that already passes the app's guard. Check all four
  combinations by eye regardless — "it looks right" is the point of this task.
- `user-docs/.vitepress/dist/` and `user-docs/.vitepress/cache/` are build output
  that happens to be present in the tree. Don't hand-edit them; `bun run build`
  regenerates them. Don't commit them.
- Use `bun run …` / `bunx …`, never `npm` / `npx` (this repo's runtime rule).
  `just user-docs-dev` (port 5175) and `just user-docs-build` are the sanctioned
  recipes.
- This task's `area` is `docs`, which is what routes the managed preview to the
  docs-site target in `repoos.toml`. Never run `repoos serve` yourself.

Assumptions (the prompt did not specify these):

- **The hand-off mechanism is the query string, not shared storage.** `repoos.org`
  and `docs.repoos.org` are different origins, so `localStorage` is per-origin and
  no key can cross between them. The appended `?theme=` / `?appearance=` is the
  mechanism; reusing the landing's key names (`repoos-ui-theme`, `repoos-theme`)
  is best-effort within an origin (e.g. a visitor who picks a theme on the docs
  site and later opens `docs.repoos.org` directly) and is worth doing anyway, but
  it is not what makes the landing→docs click work. Say this plainly in the
  README so the next reader doesn't think storage is doing the hand-off.
- The design-theme axis applies to the whole docs site — chrome, prose, custom
  containers, inline code — while code blocks stay dark in both appearances,
  mirroring both the landing page and the current `github-dark` pin.
- Gruvbox for the docs site is the *same palette in `--vp-*` terms*, not a
  token-for-token port: the docs site has surfaces the landing doesn't (sidebar,
  local search, outline) and lacks ones it does (hero, glow, screenshot frames).
  Cite the source block in a comment.
- Scope is Classic + Gruvbox on both sites, matching the landing's picker. The
  app's other themes (Clear, Gen Z, Jelly, Catppuccin) stay out of scope.
- The `?theme=` contract is forward-compatible: a valid-shaped but unknown design
  id resolves to Classic now and will light up automatically when its CSS
  exists, the same rule #0547 established on the landing.

## Scope

In: the Gruvbox design theme for the user-docs site in both appearances, the
two-axis switcher in its navbar, `?theme=` / `?appearance=` resolution and
persistence on the docs site, and the landing→docs (and docs→landing) link
hand-off.

Deferred:

- Any mechanism that crosses origins without a link — a shared cookie on
  `repoos.org`, `postMessage`, or a per-account preference. Out of scope; say so
  rather than half-building it.
- The app's other themes on the docs site or the landing page.
- Restructuring VitePress theme internals, or restyling docs chrome beyond what
  the palette swap requires.
- Anything in `src/ui-app`.

## Related

- #0547 — the landing-page switcher this extends: the two-axis model, the
  `?theme=` / `?appearance=` contract, the storage keys, and the "copy the
  values, cite the source" constraint.
- #0503 — added gruvbox to the app; the palette's origin.
- #0504 — theme-contrast guard hardening, and the comment-inside-theme-block rule.
- `landing/src/theme-resolve.ts`, `landing/src/style.css` (gruvbox blocks),
  `landing/README.md`, `user-docs/.vitepress/theme/custom.css`,
  `user-docs/README.md`.

## Original prompt

Now that we know themes (e.g. gruvbox) works on the landing page let's do the same for the user-docs site (vitepress). And make sure whatever theme is selected on the landing page carries over to the user-docs site if possible, e.g. if I'm on https://repoos.org/?appearance=dark&theme=gruvbox and I click to go to the docs site it should also have gruvbox/dark selected. Please refer to task #0547 for more details so you don't reinvent the wheel.

## Activity

- 2026-09-27T14:36:30Z · created · hello@repoos.org
- 2026-09-27T14:38:06Z · status draft→inbox, title, area, body
- 2026-09-27T14:39:27Z · status inbox→ready
- 2026-09-27T14:39:31Z · status ready→active, branch
- 2026-09-27T14:51:31Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-09-27T15:08:06Z · handoff failed · check failed after 2 automatic retries · remote validation failed (exit 137) — + pinia@4.0.2
+ radix-vue@1.9.17
+ shiki@4.4.3
+ tailwind-merge@3.6.0
+ tailwindcss@4.3.3
+ typescript@5.9.3
+ vite@8.2.0
+ vitest@4.1.10
+ vue@3.5.40
+ vue-router@5.2.0
+ vue-tsc@3.3.9
422 packages installed [5.91s]
$ bun scripts/build.mjs
$ tsc -p tsconfig.json && bun run build:ui && bun scripts/copy-assets.mjs
$ vue-tsc --noEmit -p src/ui-app/tsconfig.json && vite build --config src/ui-app/vite.config.ts
/usr/bin/bash: line 1:    40 Killed                  vue-tsc --noEmit -p src/ui-app/tsconfig.json
error: script "build:ui" exited with code 137
error: script "build:raw" exited with code 137
error: script "build" exited with code 137
[validate] gate exit 137 — retry once the runner is available, or set remoteValidation.fallbackToLocal to run the full gate locally
- 2026-09-27T15:13:55Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-09-27T15:18:39Z · handoff failed · check failed after 2 automatic retries · remote validation failed (exit 137) — + pinia@4.0.2
+ radix-vue@1.9.17
+ shiki@4.4.3
+ tailwind-merge@3.6.0
+ tailwindcss@4.3.3
+ typescript@5.9.3
+ vite@8.2.0
+ vitest@4.1.10
+ vue@3.5.40
+ vue-router@5.2.0
+ vue-tsc@3.3.9
422 packages installed [7.54s]
$ bun scripts/build.mjs
$ tsc -p tsconfig.json && bun run build:ui && bun scripts/copy-assets.mjs
$ vue-tsc --noEmit -p src/ui-app/tsconfig.json && vite build --config src/ui-app/vite.config.ts
/usr/bin/bash: line 1:    40 Killed                  vue-tsc --noEmit -p src/ui-app/tsconfig.json
error: script "build:ui" exited with code 137
error: script "build:raw" exited with code 137
error: script "build" exited with code 137
[validate] gate exit 137 — retry once the runner is available, or set remoteValidation.fallbackToLocal to run the full gate locally
- 2026-09-27T15:24:05Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-09-27T15:24:05Z · status review→active
- 2026-09-27T15:24:25Z · handoff failed · task-file handoff failed at check · remote validation failed (exit 137) — + radix-vue@1.9.17
+ shiki@4.4.3
+ tailwind-merge@3.6.0
+ tailwindcss@4.3.3
+ typescript@5.9.3
+ vite@8.2.0
+ vitest@4.1.10
+ vue@3.5.40
+ vue-router@5.2.0
+ vue-tsc@3.3.9
422 packages installed [5.64s]
$ git config core.hooksPath .githooks 2>/dev/null || true
$ bun scripts/build.mjs
$ tsc -p tsconfig.json && bun run build:ui && bun scripts/copy-assets.mjs
$ vue-tsc --noEmit -p src/ui-app/tsconfig.json && vite build --config src/ui-app/vite.config.ts
/usr/bin/bash: line 1:    39 Killed                  vue-tsc --noEmit -p src/ui-app/tsconfig.json
error: script "build:ui" exited with code 137
error: script "build:raw" exited with code 137
error: script "build" exited with code 137
[validate] gate exit 137 — retry once the runner is available, or set remoteValidation.fallbackToLocal to run the full gate locally
- 2026-09-27T15:30:05Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-09-27T15:30:06Z · status review→active
- 2026-09-27T15:33:04Z · handoff failed · task-file handoff failed at check · repoos check failed: rendering chunks... · computing gzip size... · dist/index.html                  3.95 kB │ gzip:  1.49 kB · dist/assets/index-DhkUtd-G.css  24.63 kB │ gzip:  6.10 kB · dist/assets/index-CrrfKnMP.js   93.97 kB │ gzip: 34.04 kB · ✓ built in 244ms · ⏭ macos-hub-icon-transparency  — skipped — no changed path matches macos/RepoOSHub/Assets.xcassets/**, macos/scripts/generate-app-icons.swift, macos/scripts/verify-dock-icon-transparency.swift, macos/scripts/verify-dock-icon-transparency.sh · 1 check(s) failed.
- 2026-09-27T15:38:05Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-09-27T15:38:05Z · status review→active
- 2026-09-27T15:43:17Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-09-27T15:43:17Z · status review→active
- 2026-09-27T15:45:44Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 125) —  ✓ tests/agents-view-cards.test.ts (1 test) 113ms
 ✓ tests/sw-precache.test.ts (4 tests) 3ms
 ✓ tests/dotenv.test.ts (6 tests) 3ms
 ✓ tests/serve-port.test.ts (9 tests) 5ms
 ✓ tests/clipboard.test.ts (4 tests) 17ms
 ✓ tests/toml-highlight.test.ts (4 tests) 2ms
 ✓ tests/time.test.ts (10 tests) 2ms
 ✓ tests/uninstall.test.ts (3 tests) 4ms
 ✓ tests/stories-nav.test.ts (5 tests) 4ms
 ✓ tests/reap-fixtures.test.ts (3 tests) 3ms
 ✓ tests/check-results-store.test.ts (3 tests) 3ms
 ✓ tests/needs-input-ui.test.ts (5 tests) 2ms
 ✓ tests/auth-from-header.test.ts (3 tests) 2ms
 ✓ tests/ui-recovery-banner.test.ts (2 tests) 33ms
 ✓ tests/stories-config.test.ts (5 tests) 5ms
 ✓ tests/repo-sort-order.test.ts (1 test) 5ms
 ✓ tests/diff-snapshot.test.ts (2 tests) 3ms
 ✓ tests/built-in-run-notice.test.ts (5 tests) 2ms
time="2026-09-27T23:45:44+08:00" level=error msg="Error waiting for container: Canceled: grpc: the client connection is closing: context canceled"
[validate] gate exit 125 — fix it in the feature branch and re-run the gate
- 2026-09-27T15:59:29Z · status active→review

