---
id: "0021"
title: Re-architect web UI to Vite + Vue 3 SFC (Void(0) stack)
type: refactor
status: active
priority: p1
area: web
assigned_to: ai
created_by: nick
branch: feat/0021-vite-vue-sfc-ui
created_at: "2026-06-20T00:00:00Z"
updated_at: "2026-06-20T12:22:53Z"
---
## Activity

- 2026-06-20T00:00:00Z · created · nick

## Problem

The web UI is a single ~1500-line `app.html` with Vue via a vendored runtime and
no build step. It has outgrown that form: there's no component isolation (a
change anywhere can break anything), no build-time checking (broken templates
ship as blank/mustache pages instead of failing to compile), and large
single-file edits are exactly what agents do least safely — the recent UI
breakages are a symptom of this. Move to a proper Vite + Vue 3 SFC app so the
build catches errors before they ship and changes have a small blast radius.

## Approach: scaffold → port → enhance (do NOT do it all at once)

This is a migration bundled with enhancements; keep them separate or the diff
becomes unreviewable and "did the port drop something" becomes indistinguishable
from "is the new thing wired wrong." Phases, ideally separate commits:

**PHASE 1 — Scaffold the toolchain (no behavior change yet)**
- Use the latest stable VoidZero Void(0) toolchain (by the creator of Vue):
  - Framework: Vue 3 with `<script setup>` syntax and the Composition API
  - Language: TypeScript (Vite handles this natively, zero config needed)
  - State: Pinia — lightweight, modular, officially recommended for Vue 3
  - Routing: Vue Router
  - Linter & Formatter: Oxlint + Oxfmt (`vite lint` / `vite fmt`) — Rust-based,
    replaces ESLint/Prettier
  - Testing: Vitest (`vite test`) — fast, mirrors dev environment config
  - Styling: Tailwind CSS
- Latest STABLE, mutually-compatible versions, pinned in the lockfile. Use
  bleeding-edge choices (Rolldown/Oxlint) only if frictionless; document the
  stable fallback if you hit friction.
- The server now serves BUILT output from `dist/ui/`; the vendored-Vue hack is
  removed (Vite handles Vue). `bun run build` builds the UI; `ros serve` serves
  the build.

**PHASE 2 — Port to SFCs, BEHAVIOR-PRESERVING (the careful core)**
- Decompose `app.html` into components (top bar, sidebar/tabs, dashboard,
  board + columns + cards, task drawer, new-task modal, context viewer, etc.)
- Use shadcn-vue for component library.
- Preserve the EXISTING visual design exactly — dark/neon/glass aesthetic, the
  CSS-variable design tokens, every screen and interaction. This phase adds NO
  new look and NO new component library. Tailwind styled to match the current
  app pixel-for-pixel.
- Preserve all behavior: API calls, SSE live updates, status changes, new-task
  creation, Esc-close, markdown rendering, light/dark theming — everything
  currently working must still work, identically.
- The OLD `app.html` is kept as the reference oracle and is NOT deleted in this
  task.

**PHASE 3 — Enhancements (only after Phase 2 is verified at parity)**
- PWA: web app manifest, service worker, icons, offline app shell, installable
  on mobile. Per-instance identity (name/icon) so multiple RepoOS installs are
  distinguishable when installed as PWAs.
- shadcn-vue adoption is deferred to its own task (see Scope).

## Acceptance criteria

- [ ] Vite + Vue 3 SFC app builds via `bun run build` into `dist/ui/`; `ros
      serve` serves the built output; vendored-Vue removed
- [ ] Latest STABLE, mutually-compatible versions, pinned; bleeding-edge choices
      (Rolldown/Oxlint) used only if frictionless, with documented stable fallback
- [ ] One coherent lint + format setup, documented; `bun run lint` works
- [ ] BEHAVIOR PARITY: every screen and interaction matches the old `app.html`
      — dashboard, board, drawer, new-task modal, context viewer, SSE live
      updates, status changes, Esc-close, markdown view, theming. Verify each
      against the kept reference file.
- [ ] Visual parity: the new app matches the current design (tokens, dark/neon/
      glass) — Phase 2 introduces no new visual language
- [ ] `ros check` passes against the new app — it MOUNTS (no mustache), console
      clean; the smoke check is updated to target the built app
- [ ] The old `app.html` is preserved in-repo for comparison (not deleted)
- [ ] PWA: installable, valid manifest + service worker + icons, offline shell;
      multiple installs are distinguishable (per-instance name/icon)
- [ ] Build-time checking actually works: a broken template / bad type reference
      now FAILS the build rather than shipping a blank page (demonstrate this)

## Notes for AI

- The single-file `app.html` is the REFERENCE ORACLE. The success criterion for
  Phase 2 is "indistinguishable from the old app," so diff against it constantly.
  Do not redesign in this task — port faithfully, improve later.
- Phase the work (scaffold / port / enhance) into separate commits so a reviewer
  can verify the port preserved behavior without it being tangled with new
  features. A single giant diff that does everything is the failure mode.
- Do NOT adopt shadcn-vue in this task. Tailwind yes (as a styling mechanism,
  matched to existing tokens); shadcn-vue is a component-library adoption that
  replaces hand-built components with a new design language — that's a redesign,
  not a port, and it's deferred to its own task.
- "Latest of everything" is a goal, not a mandate: if Rolldown-Vite or Oxlint
  causes real friction, fall back to standard Vite/ESLint. A clean modern app
  beats a fragile cutting-edge one. Pin versions; record what was chosen and why.
- This is the riskiest refactor yet and it touches the most-fragile area — but
  `ros check` now exists as the net. Run it continuously; the build step itself
  becomes a second net (compile errors instead of blank pages).
- Frontmatter uses `created_at` (UTC/Z) per the current format.

## Scope

- **This task**: scaffold + behavior-preserving port + PWA. Old `app.html` kept.
- **Defer to a SEPARATE task**: shadcn-vue adoption (theme to the existing
  design, replace hand-built components deliberately), and removal of the old
  `app.html` once the new app has proven itself in real use.

## Related

- Attacks the root cause of recent UI breakages (no component isolation, no
  build-time checking) rather than catching them after the fact.
- `ros check` (0018) and the build step are the safety nets that make this safe.
- shadcn-vue adoption and old-file removal are deliberate follow-ups.
- 2026-06-20T12:06:02Z · status draft→inbox

## Activity

- 2026-06-20T12:07:56Z · status inbox→ready
- 2026-06-20T12:22:53Z · status ready→active
