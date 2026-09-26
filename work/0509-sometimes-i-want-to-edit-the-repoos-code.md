---
id: "0509"
title: Add a dev-only click-to-locate inspector for UI copy
type: feature
status: inbox
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: ""
review_model_override: opencode-go/space-bunny-free
created_at: "2026-09-26T03:12:15Z"
updated_at: "2026-09-26T04:39:33Z"
---
## Problem

Editing RepoOS's own user-facing copy by hand is needlessly hard. Strings like
`"causes exactly this"` or `"attached to the new task"` are often defined inline
in a `.vue` template, or built up from concatenated fragments and computed
helpers, so the visible text does not exist on a single line anywhere in the
repo. An IDE full-text search (Zed) for what the user actually sees returns
nothing, and hunting for the right file by hand means opening candidates one by
one and eyeballing which one owns the wording.

The root problem is that the UI gives no way to go from *what you see* to *where
it is written*. A dev/local-only inspector closes that gap: click anything the
app renders, find out which source file (and line, where the build can attribute
one) the string came from, copy that path, and open the file directly in the
editor.

## Desired UX

- On a **dev/local build** of RepoOS, hovering over any visible text in the web
  UI surfaces a small inspector affordance for it; clicking opens a themed
  popup that names the source file the text came from.
- The popup shows a **repo-relative** path (e.g. `src/ui-app/src/components/IntegrationStatusBar.vue:234`),
  not a machine-absolute one.
- The popup offers **Copy path** (copies the path, with `:line` when known) so
  the user can jump to the file even when no editor is configured, and **Open
  in editor** which opens that file at that line in the editor the user
  configured.
- The editor is a normal user-facing setting: a toggle for the inspector and a
  command string for the editor (e.g. `zed {file}:{line}`), both editable in the
  **Settings UI** and stored in `repoos.toml`.
- On a **production/release build** nothing of this is present: no affordance in
  the UI, and the server refuses the open-in-editor request.
- The result for the reported cases: the user clicks the text that reads
  `causes exactly this` or `attached to the new task` and lands in the file that
  defines it, ready to edit.

## Acceptance criteria

- [ ] On a dev/local build, clicking any rendered text (including strings defined
      in a `.vue` template, not just in `<script setup>`) reveals the source file
      it originates from, plus a line number when the build can attribute one.
- [ ] The reported path is repo-relative and resolves to a real file under
      `src/`; at minimum the two motivating strings (`causes exactly this`,
      `attached to the new task`) resolve to the file that defines them.
- [ ] The inspector popup offers **Copy path**, which puts the path (with
      `:line` when known) on the clipboard and works with no editor configured.
- [ ] The inspector popup offers **Open in editor**, which opens the file (at the
      line, when known) using the configured editor command.
- [ ] Two new user-facing settings exist in `repoos.toml` and are surfaced
      through `getConfigSchema()` **and** the Settings UI with clear copy and a
      test: an inspector enable toggle and an editor command string. Placeholders
      `{file}` and `{line}` are substituted; if the command omits `{line}`, the
      line is dropped rather than appended blindly.
- [ ] The feature is inert on a non-dev build: the gate is the server's existing
      `isDevBuild()` (`src/server/reload.ts`), not the config value alone, and the
      open-in-editor endpoint is unreachable when that is false.
- [ ] The open-in-editor endpoint path-guards every request: the target must
      resolve inside the repo root, and the configured command is spawned as an
      argv array without a shell.
- [ ] The build emits whatever attribution the chosen mechanism needs (e.g.
      source maps or dev-only file/line annotations) **without** materially
      growing the shipped production bundle, and the build-staleness hash
      behavior is unchanged.
- [ ] The inspector popup follows the existing hover-pane pattern in
      `src/ui-app/src/components/IntegrationStatusBar.vue` (teleported to `<body>`,
      themed, viewport-clamped) and does not trap itself in a drawer's stacking
      context.
- [ ] Unit tests cover the attribution helper and the path guard; `repoos check`
      passes.
- [ ] The feature and the editor setting are documented in `user-docs/`
      (configuration plus a dev-tooling note), including that it is dev/local
      only.

## Notes for AI

- **Assumption — "dev/local"** means a build from a source checkout, i.e.
  `isDevBuild()` is true (this repo's own `repoos serve` and previews of this
  repo's tasks). An installed/released binary build is production and gets
  nothing. If a preview of some *other* repo's app is inspected, there is no
  RepoOS source to point at — that case should degrade quietly to the current
  behavior, not error.
- **Assumption — config shape.** Use a `dev` section with
  `dev.inspector.enabled` (boolean; default `true` for a dev build, forced
  `false` otherwise) and `dev.inspector.editorCommand` (string; default empty =
  copy-path only). Follow the existing `ConfigFieldMeta` pattern in
  `src/core/config.ts` and put the controls on the Settings **Advanced** tab,
  adding them to `FIELD_TAB` in `SettingsView.vue` if you want `?focus=`
  routing. Pick these exact names deliberately — this file is a self-hosted
  repo, and the schema is the contract other agents read.
- **Mechanism is your call**, but it must actually work for the motivating
  cases, not just a demo component. Realistic options: Vite `build.sourcemap` for
  dev builds plus a source-map lookup on the clicked text node; or Vue
  compiler-supplied file/line annotations surfaced as dev-only `data-*`
  attributes; or a dev-only `v-inspect` directive. State the choice and its
  limits in the MR description. Note the shipped UI is a Vite production bundle
  with no source maps today (`src/ui-app/vite.config.ts`), so this is a real
  build change, not just a UI change.
- Line numbers are **best-effort**: exact for strings defined in a `.ts`
  module, approximate for copy composed inside a template. Acceptance reflects
  that on purpose — do not build a source-level parser to get the last few
  percent of precision.
- Likely files: `src/ui-app/vite.config.ts`, a new component/composable under
  `src/ui-app/src/components/` or `src/ui-app/src/lib/`, `src/core/config.ts`,
  a dev-gated route under `src/server/routes/`, `SettingsView.vue`, and tests
  under `src/ui-app/tests/` plus the server suite.
- **Do not** add a runtime dependency (hard constraint; spawn the configured
  command with `child_process.spawn` and an argv array — no shell string
  interpolation).
- **Do not** add a nav entry or a top-level route for this; it is a passive
  overlay, not a page.
- **Do not** hand-edit `work/*.md`, and do not request a preview unless the human
  asks — this feature is specifically about the dev build, so verification
  happens against a local `bun run build` plus the tests.

## Scope

In scope: the click-to-locate inspector, its popup, copy-path, open-in-editor,
and the two settings (TOML + Settings UI + tests + docs).

Deferred:

- Consolidating RepoOS's user-facing copy into a single strings module or an
  i18n layer so a single search does find every visible string. That is the
  "other" fix for the original problem; the inspector is the cheap fix that does
  not require touching every view. File separately if it is still wanted.
- Auditing and rewriting the copy that is currently split across lines or
  assembled by concatenation, so it is greppable as-is.
- Attributing rendered text in *other* projects' apps (a preview of a non-RepoOS
  repo has no RepoOS source to point at).

## Related

- The dev-build gate is `isDevBuild()` in `src/server/reload.ts`; the
  build-staleness/hash behavior it shares is documented in `AGENTS.md`
  ("This repo is self-hosted") and `docs/architecture.md`.
- The themed, body-teleported hover pane to model the popup on is in
  `src/ui-app/src/components/IntegrationStatusBar.vue` (#0460).
- Settings-schema rule: `AGENTS.md`, "Every user-facing `repoos.toml` feature
  setting needs a Settings UI control."

## Original prompt

Sometimes I want to edit the repoos code myself, particularly with simple copy changes (like "causes exactly this" or "attached to the new task". But when I search through the repoos repo in my IDE (zed) I often can't find it, maybe it's because the text is not on a single line, what would you suggest as an easy way to fix these issues? would it be possible to have a mouse tool on the dev/local version of RepoOS where I can simply click on anything and see what file it's from (and copy the file name or something to easily go edit that file in my IDE/editor (which could be defined in settings/repoos.toml)

## Screenshots

![Screenshot-2026-09-26-at-11.08.12](/api/tasks/0509/attachments/screenshot-1.png)
![Screenshot-2026-09-26-at-11.04.08](/api/tasks/0509/attachments/screenshot-2.png)

## Activity

- 2026-09-26T03:12:15Z · created · hello@repoos.org
- 2026-09-26T03:12:16Z · screenshots
- 2026-09-26T03:12:16Z · screenshots
- 2026-09-26T03:13:19Z · status draft→inbox, title, area, body
- 2026-09-26T04:39:33Z · review_model_override
