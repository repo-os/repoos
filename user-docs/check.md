# Checks before merge

```bash
repoos check
```

One command is the whole definition of done. It exits non-zero on any failure,
so the same checks work locally, in CI, and inside the close-out pipeline. An
agent must get it green before handing a task back, and it runs again before
anything merges.

## What it runs

Steps run in order, and several are conditional on what your repo declares:

| Step | What it checks | Runs when |
| --- | --- | --- |
| Build staleness | `src/` matches the last `dist/.build-info.json` build | Your repo uses RepoOS's build contract |
| Lockfile sync | `bun.lock` matches `package.json` | A `bun.lock` exists |
| Zero runtime deps | `package.json` has empty `dependencies` | The package is named `repoos` |
| Formatting & lint | Runs your `fmt:check` and `lint` scripts | Those scripts exist |
| Full build | Runs your `build` script | Always |
| CSS layering | No unlayered universal/bare-element selectors | `[check] uiStylesheet` imports Tailwind v4 |
| Theme contrast | Button gradients valid; token pairs meet ≥3:1 | `[check] uiStylesheet` and `themeScopes` are configured |
| Bare `require()` | No bare `require` in ESM source | The package is `"type": "module"` and a source root is declared (`[check] bareRequireDirs` or a tsconfig `include`) |
| Task assets | No committed binaries under your task/input dirs | Always |
| Tests | Runs your `test` script | A `test` script or a test directory exists |
| UI smoke | Boots the app and checks whatever your declared smoke command asserts (RepoOS's own default: the app mounts with no console errors) | You opt in (see below) |

The one step that is RepoOS-specific — zero-runtime-deps — **skips cleanly**
in a repo it doesn't apply to. It exists to enforce RepoOS's own zero-dependency
invariant; you don't have to satisfy it.

## Making it meaningful in your repo

`repoos check` picks up the standard `package.json` scripts by name. A
**`build` script is required** — the full-build step runs it on every check, so
a repo without one fails the check. `test`, `fmt:check`, and `lint` are
optional: each step skips cleanly when its script is absent.

**The UI smoke test is opt-in.** Because only your project knows how to boot
its own UI, RepoOS runs it only when you tell it how:

- a `smoke` script in `package.json`, or
- `[check] uiSmoke = "..."` in `repoos.toml`.

The config value wins if both are set. With neither, the step skips with a clear
message rather than pretending your UI was tested. RepoOS's own repo dogfoods
this same mechanism — it declares a `smoke` script instead of being special-cased.

**The CSS-layering and theme-contrast guards are opt-in too, and carry no
RepoOS-shaped default.** Point them at your own stylesheet with `[check]
uiStylesheet` in `repoos.toml`. CSS layering then runs automatically whenever
that file imports Tailwind v4 (`@import "tailwindcss"`).

The theme-contrast guard also needs your token vocabulary, because token names
are project-specific:

```toml
[check]
uiStylesheet = "src/app.css"
backdropToken = "--bg"                   # page background; semi-transparent tokens composite over it
gradientTokens = ["--btn-primary-bg"]   # must resolve to a gradient, not a solid color

[[check.themeScopes]]                    # one row per theme block
selector = ":root"
name = "dark"
inherits = ["dark"]                      # earlier scopes whose tokens it inherits

[[check.contrastPairs]]                  # fg/bg pairs checked for ≥3:1 contrast
fg = "--txt"
bg = "--bg"
```

`themeScopes` are evaluated in order; each inherits the declarations of the
scopes named in `inherits` (later wins), so a light variant can inherit a dark
base and override only what differs. With no `uiStylesheet` — or no
`themeScopes` — both steps skip with a clear message; a `uiStylesheet` that
doesn't exist is called out with a warning. RepoOS's own repo declares its
stylesheet and full token vocabulary this way rather than relying on hardcoded
defaults.

**Several steps adapt to your layout rather than assuming RepoOS's:**

- The **build-staleness** step degrades to a skip — not a failure — for a
  project whose `src/` uses a different build pipeline. It only applies once a
  `dist/.build-info.json` marker exists, so a repo with an unrelated `src/`
  directory isn't judged against RepoOS's build contract.
- The **task-asset guard** reads `workDir` and `inputsDir` from `repoos.toml`,
  so a repo that calls those folders `tasks/` and `attachments/` is still
  guarded.
- The **bare-require guard** carries no RepoOS source layout: it runs only for a
  `"type": "module"` package, and scans the roots you declare in `[check]
  bareRequireDirs` (carving out subtrees with `bareRequireExcludes` if you need
  to) — or, absent that, your tsconfig `include` list minus its `exclude` list.
  With neither a configured root nor a usable tsconfig include it skips with a
  clear message, rather than passing vacuously. Only the repo-root
  `tsconfig.json` is read; a config that gets its `include`/`exclude` from an
  `extends` base won't be followed, so declare `bareRequireDirs` there instead.

## Using it in CI

Because it's one command with a non-zero exit code, `repoos check` is a drop-in
CI step:

```yaml
- run: bun install --frozen-lockfile
- run: repoos check
```

## Going deeper

The step-by-step audit of which steps are genuinely generic versus
still RepoOS-shaped lives in RepoOS's own build context:
[the check-step genericity audit](../docs/audits/2026-09-check-step-genericity-audit.md)
— a repo-relative link that ships in the RepoOS source checkout, not on this
site. It's written for people
working on RepoOS itself, so treat it as the reasoning behind the table above,
not as user documentation.
