---
id: "0029"
title: Remove the legacy pre-Vite HTML UI
type: chore
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/0029-remove-legacy-html-ui
created_at: "2026-08-05T06:55:26Z"
updated_at: "2026-08-11T14:40:11Z"
---
## Activity

- 2026-08-05T06:55:26Z · created · unknown

## Problem

0021 re-architected the web UI onto Vite + Vue 3 SFC (`src/ui-app/`). The old
pre-Vite UI (`src/ui/app.html`, vendored Vue runtime, no build step) is now
dead weight:

- `scripts/copy-assets.mjs` no longer copies `src/ui/` anywhere — the Vite
  build emits `dist/ui/` (index.html + hashed /assets/) and `app.html` is
  absent from `dist/ui/`. The server's `app.html` fallback
  (`src/server/server.ts:439`) therefore never fires in practice.
- The dead code lingers: `src/ui/`, the fallback branch, `scripts/dev-compare.mjs`
  (the "compare" npm script built for the 0021 transition), stale comments in
  `src/commands/check.ts` and `src/ui-app/src/style.css`, and docs that still
  describe `src/ui` as the web UI.

## Desired UX

No user-visible change. `repoos serve` keeps serving the built Vite SPA; the
UI smoke check keeps passing. The repo simply no longer ships the legacy UI,
and docs/code stop referencing it.

## Acceptance criteria

- [ ] `src/ui/` is deleted (app.html, favicon.svg, vendor/)
- [ ] `src/server/server.ts` SPA fallback serves only the Vite `index.html`;
      the legacy `app.html` branch is gone
- [ ] `scripts/dev-compare.mjs` and the `compare` npm script are deleted
- [ ] `src/commands/check.ts` keeps the /assets/ sanity assertion but no longer
      references "legacy app.html"
- [ ] Docs updated to describe the current UI: `docs/architecture.md`
      (src/ui tree + "a single self-contained app.html" section) and
      `docs/concepts.md` now point at `src/ui-app` (Vite + Vue 3 SFC)
- [ ] No remaining references to `src/ui`, `app.html`, or `dev-compare` outside
      git history and closed task files
- [ ] `repoos check` passes (build + tests + UI smoke)
- [ ] `repoos serve` serves the built UI (index.html, not app.html)

## Notes for AI

- Runtime impact today is nil (app.html is already absent from `dist/ui/`), so
  this is pure dead-code removal + doc cleanup. Keep it a normal deletion
  commit — do not rewrite history.
- DEPENDENCY: work/0025 (shadcn-vue migration) references the `bun run compare`
  oracle in its acceptance criteria. Coordinate — either land 0025 first or
  update its criteria when it starts. This task may remove the compare tool.
- Do NOT touch `src/ui-app/` (the current UI) or `src/ui-app/public/`
  (`dist/ui/favicon.svg` comes from there, not from `src/ui/`).
- Files to touch: `src/ui/` (delete), `src/server/server.ts`, `src/commands/check.ts`,
  `scripts/dev-compare.mjs` (delete), `package.json` (scripts), `docs/architecture.md`,
  `docs/concepts.md`, and the stale header comment in `src/ui-app/src/style.css`.
- Related: 0021 (re-architect) built the compare tool for the transition; its
  purpose is served.

## Activity

- 2026-08-11T00:17:35Z · status inbox→ready
- 2026-08-11T14:40:11Z · status active→review · implementation committed; repoos check green
