# Checks before merge

```bash
repoos check
```

One command is the whole definition of done. It exits non-zero on any failure,
so the same checks work locally, in CI, and inside the close-out pipeline. An
agent must get it green before handing a task back, and it runs again before
anything merges.

## The check plan

`repoos check` runs the plan your repo declares — not a pipeline RepoOS assumes
for you. Same command, whatever the stack: Go, Android/Gradle, Rust, JavaScript,
or a mix.

```toml
[check]
version = 1

[[check.steps]]
name = "build"
command = "go build ./..."
requires = ["go"]

[[check.steps]]
name = "tests"
command = "go test ./..."
requires = ["go"]
```

Steps run in the order you declare them, and each one ends in exactly one of
these — printed with its own icon so a skip never looks like a pass:

| Result | Icon | What it means |
| --- | --- | --- |
| Passed | `✔` | The command exited 0 |
| Failed | `✗` | The command ran and exited non-zero (the detail names it) |
| Timed out | `✗` | It exceeded `timeoutMs` and was killed |
| Missing prerequisite | `✗` | A binary the step needs isn't installed — the detail is install advice |
| Skipped | `⏭` | The step was explicitly excluded, and the detail says why |

A **required** step that can't run fails the gate. That's the whole point of
declaring `requires = ["go"]`: a machine without Go must not report a green
definition of done. Only a step you mark `required = false` is advisory.

### Step fields

| Field | Default | Meaning |
| --- | --- | --- |
| `name` | derived | Identifies the step in output and in `dependsOn`. Lowercase, no spaces. |
| `command` | — | Shell command to run. |
| `kind` | — | A built-in guard instead of a command (see below). |
| `cwd` | repo root | Repo-relative directory to run in — a monorepo step can target `backend/`. |
| `timeoutMs` | `600000` | Kill the step after this long. |
| `required` | `true` | `false` makes a failure advisory instead of gating. |
| `profiles` | every profile | Which profiles include this step. `["full"]` keeps a slow step out of a routine run. |
| `whenChanged` | always runs | Path globs; in changed-path mode the step runs only when one matches. |
| `requires` | — | Binaries that must be on `PATH`. |
| `runsOn` | any host | Host capabilities a **remote** run of this plan needs (`remoteValidation`), e.g. `runsOn = ["macos"]`. The runner routes the whole job to a host whose `os`/`labels` provide every capability; a job with no `runsOn` runs on any host, and local runs ignore the field. |
| `dependsOn` | — | Skip this step if a named earlier step failed. |

### Built-in `kind`s

`kind` runs a guard that inspects your repo and **skips with a stated reason
when it doesn't apply** — none of them assume a `package.json`, a Bun pipeline
or a JS build:

| Kind | What it checks | Skips when |
| --- | --- | --- |
| `staleness` | `src/` matches the last `dist/.build-info.json` build | Your repo doesn't use RepoOS's build contract |
| `lockfile-sync` | `bun.lock` matches `package.json` | There is no `bun.lock` |
| `zero-runtime-deps` | `package.json` has empty `dependencies` | The package isn't named `repoos` (this is RepoOS's own invariant, not a rule for your repo) |
| `format` | Runs your `fmt:check` script | No such script |
| `lint` | Runs your `lint` script | No such script |
| `build` | Runs your `build` script | No such script |
| `tests` | Runs your `test` script (or a test directory) | No test suite |
| `ui-smoke` | Runs your smoke command | You declared none |
| `css-layers` | No unlayered universal/bare-element selectors | No `[check] uiStylesheet`, or it isn't Tailwind v4 |
| `theme-contrast` | Button gradients valid; token pairs meet ≥3:1 | No `uiStylesheet`/`themeScopes` |
| `bare-require` | No bare `require` in ESM source | The package isn't `"type": "module"`, or no source root |
| `task-assets` | No committed binaries under your task/input dirs | Never — it reads `workDir`/`inputsDir` |

## Opting the stylesheet guards in

The full `[check]` field list, types, and defaults are in the
[repoos.toml reference](/configuration#previews-and-checks).

The CSS-layering and theme-contrast guards carry no RepoOS-shaped default path,
and token names are project-specific, so they read your vocabulary from
`[check]`:

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
base and override only what differs. A `uiStylesheet` that doesn't exist is
called out rather than silently skipped.

A block you declare is only read if the guard can parse it, and two things stop
it — both quiet, since a theme that isn't checked just isn't reported on:

- A `:root[data-ui-theme="…"]`-style block with no matching `themeScopes` row is
  never evaluated. Declare one row per appearance.
- The scanner reads top-level blocks line by line: the selector must open the
  block on one line ending in `{`, one declaration per line, and no `/* … */`
  comment between declarations — a comment line corrupts the key that follows it
  and drops that token from the check.

A `contrastPairs` token may resolve to hex (including 8-digit `#rrggbbaa`) or
`rgb()`/`rgba()`, spaced or not. A color the guard cannot read is *skipped*
rather than failed, so an unparseable value means the pair is never checked —
prefer 8-digit hex over a low-alpha `rgba()` when a pair's background needs
transparency, since it is unambiguous. Semi-transparent colors are composited
over the `backdropToken` (the page background) before contrast is measured. A
gradient is judged on its worst stop, and every stop counts.

The **UI smoke test** is a command only you can know. Declare it either way:

- a `smoke` script in `package.json`, or
- `[check] uiSmoke = "..."` in `repoos.toml` (config wins).

With neither, the step skips with a clear message rather than pretending your
UI was tested. RepoOS's own repo dogfoods this same mechanism — it declares a
`smoke` script instead of being special-cased.

## Profiles

A profile is a named subset of the plan. Steps with no `profiles` belong to
every profile; a step listed only in `["full"]` stays out of a routine run:

```bash
repoos check                 # default profile
repoos check --profile full  # every step, including the slow ones
```

Close-out always runs `--profile full` against the merged candidate — the merge
gate is not the place to skip anything.

## Changed-path mode (fast pre-review pass)

```bash
repoos check --changed main
```

With `--changed <ref>` (or `REPOOS_CHECK_CHANGED=<ref>` in the environment),
steps that declare `whenChanged` run only when a changed path matches their
globs; steps without it still run. This is a **fast pre-review pass** — an
agent's self-check before handoff — never the final gate. Close-out runs the
full plan.

When `[remoteValidation] enabled = true`, a **full** `repoos check` (no
`--changed`) runs install + build + tests on the remote runner first, then local
guards only. Changed-path mode does **not** trigger the remote half — it stays a
fast local pass. Pass `--local-tests` to force the full local suite even when
remote validation is enabled.

### Cross-cutting steps

A step with **no** `whenChanged` runs whatever changed. That is how you keep a
contract or integration check from being skipped just because only one side of
a change moved — an Android client and a TypeScript backend, or a Vue frontend
and a Go backend. Give the inferred per-stack steps path globs (they already
carry them) and add one explicit cross-cutting step for the contract:

```toml
[[check.steps]]
name = "cross-stack-contract"
command = "make contract-test"
profiles = ["integration"]     # keep it out of a routine run
```

A change that touches both stacks still matches both sets of globs, so the fast
mode never hides a cross-stack change; the contract step runs on top of that.

## The Checks page

The **Checks** page shows what `repoos check` will run without running it. For
the profile you pick it lists every step in order — command, `cwd`, timeout,
dependencies, profile membership, and the paths `whenChanged` watches — and says
for each one whether it will run or why it is skipped. A required step whose
declared tool is missing is shown as a **missing prerequisite with the exact
command to install it**, never as a success, and the last completed run's
result, duration and command output are shown alongside.

## Run history

Every check run — local or remote, pre-review or close-out or release, and bare
`repoos check` invocations — is recorded in `.repoos/checks.db` with the machine
that ran it, how long it took, whether it was the full suite or a changed-path
pass, which steps were skipped, and what failed. The history lives in the MAIN
checkout: a standalone `repoos check` inside a task worktree records into the
same file the server reads, not a per-worktree store. The Checks page's **Runs**
tab shows this history as a sortable table across all tasks, with a per-machine
summary (runs, pass rate, median full-suite duration) above it — so "how long
does a full suite take on bee vs mini?" and "was that failure a fluke?" are
questions the table answers, not archaeology in log files. A run whose caller's
deadline passed mid-dispatch is recorded as **cancelled**, not failed, so a
give-up never reads as a gate the branch failed.

When the test suite fails, the run also records the name of every failing test
(`file > suite > test`) in a `failed_tests` column, and the Runs tab shows the
count and lists the names on hover. This is what tells a repeat offender from a
one-off: `sqlite3 .repoos/checks.db "select failed_tests from check_runs where
failed_tests is not null"`. Runs that executed on a remote validation host
record the failed step but not yet the test names.

The **Remote runners** tab shows each configured host live: health, the runs in
flight right now (task and elapsed time), what is queued next, and the last
completed run with its outcome and duration.

On the task page itself, a chip appears while a check is in progress —
"Checks running on mini · 2m 34s" — and stays afterwards showing the result
inline; click it to open the task's Debug tab with the full check output.

## Bootstrapping a plan with `repoos init`

When a repo has no check plan yet, `repoos init` inspects its durable signals
(a package manifest, `go.mod`, `Cargo.toml`, a Gradle wrapper, a Makefile or
justfile) and writes a **proposal** to `repoos.check-plan.proposed.toml`. The
proposal is not configuration: `repoos check` never reads it. Review and edit
it, then move its `[[check.steps]]` into `repoos.toml` (interactive init offers
to do this for you). Until then `repoos check` still fails with a "no check
plan" diagnostic rather than passing vacuously — a starter plan that ran before
anyone looked at it would make the gate lie.

## When a repo declares nothing

Nothing is assumed. If a repo declares no `[[check.steps]]`, `repoos check`
falls back, in order, to:

1. **Your legacy `[check]` keys** (`uiSmoke`, `uiStylesheet`, …) — still
   supported, with a migration warning pointing at `--print-plan`.
2. **Inference from repo markers** — `go.mod` → `go build ./...` +
   `go test ./...`; `Cargo.toml` → `cargo build`, `cargo fmt --check`,
   `cargo test`; a committed `gradlew` → `./gradlew assemble` + `./gradlew
   test`; `package.json` scripts → the matching `format`/`lint`/`build`/`tests`
   /`ui-smoke` steps.
3. **Nothing.** A repo with no recognisable stack gets no steps at all — and
   that fails the gate with a diagnostic, because a gate that ran nothing is
   not a green definition of done.

Inference is a convenience, not a configuration: `repoos check` says so, and
`repoos check --print-plan` prints the resolved plan as `[[check.steps]]` TOML
you can commit.

## Using it in CI

Because it's one command with a non-zero exit code, `repoos check` is a drop-in
CI step:

```yaml
- run: bun install --frozen-lockfile
- run: repoos check
```

## Going deeper

The step-by-step audit of which steps are genuinely generic versus still
RepoOS-shaped lives in RepoOS's own build context:
[the check-step genericity audit](../docs/audits/2026-09-check-step-genericity-audit.md)
— a repo-relative link that ships in the RepoOS source checkout, not on this
site. It's written for people working on RepoOS itself; #0446 implemented its
recommendation, which is this declarative plan.
