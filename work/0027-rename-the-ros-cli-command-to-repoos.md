---
id: "0027"
title: Rename the ros CLI command to repoos
type: feature
status: inbox
priority: p2
area: cli
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-04T10:48:34Z"
updated_at: "2026-08-04T10:48:34Z"
---
## Activity

- 2026-08-04T10:48:34Z · created · unknown

## Problem

`ros` is a short, generic bin name that clashes with other tools in the wild
(e.g. ROS — Robot Operating System — and assorted `ros` executables on PATH).
Since most users drive RepoOS through the web UI rather than the CLI, the
command name is typed rarely, so a distinctive, unambiguous name costs nothing
in muscle memory and removes the collision risk. Anyone who wants the short form
can `alias ros=repoos` in their own shell — an alias is personal and can't
collide with tools other people ship.

## Desired UX

- `repoos <command>` is the canonical CLI entry: `repoos list`, `repoos new`,
  `repoos check`, `repoos serve`, `repoos init`, ...
- All user-facing text (help, usage errors, init scaffold hints, docs, the
  AGENTS.md template) says `repoos`.
- `ros` is NOT shipped as a bin name. Users who want it alias it themselves.

## Acceptance criteria

- [ ] `package.json` `bin` exposes `repoos` (not `ros`); after `bun link`,
      `repoos <command>` works and `repoos --help` reads correctly
- [ ] Every user-facing string references `repoos`: CLI help + usage errors,
      staleness warning, `init` scaffold output + its sample task + its
      AGENTS.md template, and the README/docs that point at the CLI
- [ ] `repoos check` is green (staleness, build, tests, UI smoke test)
- [ ] This repo's own AGENTS.md operating loop + docs use `repoos`
- [ ] No new runtime dependencies; dist is rebuilt so compiled strings follow
- [ ] Historical `work/*.md` task files and ADRs are NOT rewritten — they are
      records of the era when the command was `ros`

## Notes for AI

- Surface to rename (grep `ros`): `package.json` (bin + `"ros"` npm script),
  `src/cli/index.ts` (usage text + "Bin name: `ros`" comment), usage strings and
  `const ros = createRepoOS()` locals in `src/commands/tasks.ts`, `serve.ts`,
  `check.ts`, `init.ts` (including the `AGENTS_MD` template and `cmdInit`
  output), staleness message in `src/core/build.ts`, comment in
  `src/core/types.ts`, comments in `scripts/dev-compare.mjs`, `docs/*.md`
  (architecture, roadmap, ADR 0002/0003, vision), and this repo's `AGENTS.md`.
- Product naming `RepoOS` / `createRepoOS()` stays as-is; only the command name
  and identifiers that represent the bin (`const ros =` → `const repoos =`)
  change. Renaming the locals keeps grep clean.
- `dist/` is committed: run `bun run build` so the compiled CLI help and template
  follow, then `bun link` to register `repoos` for the dev binary (the old
  `ros` symlink in `~/.bun/bin` can be removed by the user).
- Self-hosted: the staleness guardrail now warns for `repoos` too; `repoos check`
  is the green bar.
- Backward-compat decision baked into this task: do NOT ship a `ros` bin alias.
  Revisit only if a future task argues for a deprecation window.

## Scope

- **This task**: rename bin + all user-facing strings + docs + template + relink.
- **Defer**: shipping a `ros` alias, renaming the repo/package, changing any file
  format or the `RepoOS`/`createRepoOS()` product identifiers.

## Related

- `docs/adr/0003-self-hosting.md` — `bun link` dev loop that installs the bin.
- `docs/architecture.md` / `docs/roadmap.md` — reference `ros` commands.
- The AGENTS.md *template* in `src/commands/init.ts` is separate from this
  repo's AGENTS.md; both must be updated.
