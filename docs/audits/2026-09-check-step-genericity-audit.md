# `repoos check` step genericity audit

**Date:** 2026-09-15 · **Task:** #0348 · **Status:** active

`repoos check` is the generic definition-of-done gate every managed project
runs (AGENTS.md → Definition of Done), but parts of it grew up around RepoOS's
own repo and silently assume a RepoOS-shaped project. #0348 made the `ui-smoke`
step per-project opt-in; this audit covers the sibling steps the task asked us
to check for the same class of problem. Findings only — fixes beyond the
`ui-smoke` change are recommended follow-ups, not done here, so the task stays
bounded.

Legend: **Generic** = behaves sensibly for any repo · **Hidden RepoOS-shape** =
only meaningful here but degrades to a benign skip elsewhere · **Risk** = can
hard-fail or mislead a non-RepoOS project.

---

## 1. `ui-smoke` — fixed by #0348

`check.ts`'s UI smoke step always booted RepoOS's own dashboard
(`startPreviewServer` → `startServer`) and asserted `title === "RepoOS"`,
`.nav-item`/`.board`/`.new-btn`, the brand string, and the Tailwind
`css-layers` spacing invariant. For any other project that either tested
RepoOS's UI or failed on RepoOS-only infrastructure (the #0345 port-contention
timeout). Now opt-in:

- `package.json` `scripts.smoke` — zero-config default (same convention as
  `build`/`test`/`lint`).
- `repoos.toml` `[check] uiSmoke = "..."` — overrides the script when both
  exist (`[checks]` accepted as an alias).
- Neither, and the step skips: `✔ ui-smoke — skipped — no smoke command
  configured`.
- RepoOS's own repo declares its existing dashboard assertions through the
  same mechanism: a `smoke` script (`scripts/ui-smoke.mjs` →
  `src/commands/ui-smoke.ts`). There is no `pkg.name === "repoos"` special
  case, so RepoOS's own check exercises the declaration path on every run.
  Coverage is unchanged, including the "Playwright not installed → skip" path.
  A test in `check-smoke-command.test.ts` fails if the declaration goes
  missing, which would otherwise turn RepoOS's smoke step into a silent skip.

## 2. `css-layers` / `theme-contrast` — fixed by #0351

Both read a **hardcoded** path, `src/ui-app/src/style.css` (`cssPath`, check.ts
roughly line 700+), and:

- `css-layers` only runs when that file contains `@import "tailwindcss"`.
- `theme-contrast` only runs when that file contains `:root{`.

The guard *logic* is arguably generic (Tailwind v4 cascade layers; WCAG
contrast), but the **path and the token names are RepoOS's own**
(`THEME_VARIANTS`, `CONTRAST_PAIRS`, `GRADIENT_TOKENS` all reference this repo's
custom properties, e.g. `--btn-primary-bg`, `--tag-stream-bg`). A managed
project with a UI at `apps/web/src/app.css` gets no coverage; a project that
happens to match the path but has unrelated tokens would be judged against
RepoOS's token vocabulary. In practice the skip is clean, so this never fails a
project — it just does nothing off-repo.

**Recommendation (follow-up):** make the stylesheet path and the token
vocabulary configurable under the same `[check]` mechanism (`uiStylesheet`,
and either declared token pairs or a project-supplied command), rather than
growing `ui-smoke` to cover it.

**Fixed in #0351.** Both guards now read `[check] uiStylesheet`, and the
contrast guard's vocabulary is declared under `[check]` as `themeScopes`
(selector → variant name + inherited scopes), `contrastPairs`, and
`gradientTokens`. `check.ts` no longer contains `THEME_VARIANTS`,
`CONTRAST_PAIRS`, `GRADIENT_TOKENS`, or the `src/ui-app/src/style.css` path;
RepoOS declares its current coverage through the same config in its
`repoos.toml`, and a project that configures nothing skips both steps cleanly.

## 3. `bare-require` — hidden RepoOS-shape, benign

`bareRequireOffenders()` walks the fixed directories `src/{core,server,commands,cli}`
and skips `*.test.ts`. For a managed project with a different source layout it
scans nothing and passes vacuously. So it never fails off-repo, but it also
never protects off-repo. The guard's premise (`"type": "module"` package whose
bare `require` breaks only in compiled ESM) is genuinely generic; only the
directory list is RepoOS-shaped.

**Recommendation (follow-up):** let the scanned source roots come from config
(e.g. a `[check] sourceDirs` list, or derive from the repo's `tsconfig`), or
scope the guard to `"type": "module"` packages only.

## 4. `task-assets` — hidden RepoOS-shape, benign

`git ls-files -- work inputs` is hardcoded, and `taskAssetOffenders()` matches
the literal prefixes `work/` / `inputs/`. `repoos.toml` already makes those
directories configurable (`workDir`, `inputsDir`) but this step ignores the
config. A managed repo with `tasks/` instead of `work/` is simply unguarded.

**Recommendation (follow-up):** feed `cfg.workDir` / `cfg.inputsDir` into the
`git ls-files` pathspec and the prefix test. Small and self-contained.

## 5. `lockfile-sync` — generic, bun-only

Runs only when `bun.lock` exists, then `bun install --frozen-lockfile --dry-run`.
A npm/pnpm/yarn project skips entirely (no `bun.lock`), so it is safe but not
universal. **Generic** for bun-based repos; a possible future improvement is to
recognize `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock` and run the
matching frozen install. Not urgent — every RepoOS-managed repo so far uses Bun.

## 6. `dist/.build-info.json` staleness marker — CLI-shaped, one real risk

`checkBuildForRoot()` (src/core/build.ts) returns:

- `published` (skip) when `src/` is absent — good for non-CLI projects.
- `no-build` → **stale/FAIL** when `src/` exists but `dist/` does not.
- `no-marker` → **stale/FAIL** when `dist/` exists without `.build-info.json`.

The marker is written by RepoOS's own `bun run build`. A managed project with a
`src/` directory but a different (or no) build pipeline — output outside
`dist/`, or a build that doesn't write `.build-info.json` — would hard-fail the
first check of `repoos check`, even though nothing about RepoOS's binary is
wrong. A project with no `src/` at all is fine. This is the closest thing to a
regression in the audited set.

**Recommendation (follow-up):** make the staleness/build-info step opt-in too,
keyed on the project actually declaring a RepoOS-style build (e.g. a `[check]
buildInfo` marker or the presence of the marker file itself), so a project with
an unrelated `src/` layout degrades to a skip instead of a failure. Note this
step is **not** changed by #0348; it predates it and is out of scope here.

---

## Follow-ups filed

1. #0351: `[check]`-driven stylesheet path + token vocabulary for
   `css-layers`/`theme-contrast`. **Done** — see section 2.
2. #0352: configurable source roots for `bare-require`.
3. #0350: honor `workDir`/`inputsDir` in `task-assets`.
4. #0349: opt-in / graceful degradation for the `dist/.build-info.json`
   staleness step when a project's `src/` doesn't use RepoOS's build pipeline.