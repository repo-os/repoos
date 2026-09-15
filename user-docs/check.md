# The check gate

```bash
repoos check
```

One command is the whole definition of done. It exits non-zero on any failure,
so the same gate works locally, in CI, and inside the close-out pipeline. An
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
| CSS layering | No unlayered universal/bare-element selectors | Your stylesheet imports Tailwind v4 |
| Theme contrast | Button gradients valid; token pairs meet ≥3:1 | Your stylesheet defines `:root` tokens |
| Bare `require()` | No bare `require` in ESM source | Scans `src/{core,server,commands,cli}` |
| Task assets | No committed binaries under your task/input dirs | Always |
| Tests | Runs your `test` script | A `test` script or a test directory exists |
| UI smoke | A headless browser boots the app, asserts it mounts with no console errors | You opt in (see below) |

The steps that are RepoOS-specific — zero-runtime-deps, CSS layering, theme
contrast, the bare-require scan roots — **skip cleanly** in a repo they don't
apply to. They exist to enforce RepoOS's own invariants; you don't have to
satisfy them.

## Making it meaningful in your repo

`repoos check` picks up the standard `package.json` scripts by name: `build`,
`test`, `fmt:check`, `lint`. Declare the ones you have; the rest skip.

**The UI smoke test is opt-in.** Because only your project knows how to boot
its own UI, RepoOS runs it only when you tell it how:

- a `smoke` script in `package.json`, or
- `[check] uiSmoke = "..."` in `repoos.toml`.

The config value wins if both are set. With neither, the step skips with a clear
message rather than pretending your UI was tested. RepoOS's own repo dogfoods
this same mechanism — it declares a `smoke` script instead of being special-cased.

**Two steps adapt to your layout rather than assuming RepoOS's:**

- The **build-staleness** step degrades to a skip — not a failure — for a
  project whose `src/` uses a different build pipeline. It only applies once a
  `dist/.build-info.json` marker exists, so a repo with an unrelated `src/`
  directory isn't judged against RepoOS's build contract.
- The **task-asset guard** reads `workDir` and `inputsDir` from `repoos.toml`,
  so a repo that calls those folders `tasks/` and `attachments/` is still
  guarded.

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