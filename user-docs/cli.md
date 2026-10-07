# CLI reference

Run `repoos` with no arguments to see this list in your terminal.

## Setup

### `repoos init [name]`

Scaffolds RepoOS files in the current repo, plus an `inbox` starter task so the
board isn't empty — a suggestion for you, not work to auto-run, promoted with
`repoos mv <id> ready`. The starter body follows the repo's content: an
effectively empty repo (no meaningful source yet) gets the product-vision task,
otherwise the read-the-codebase one; override with
`repoos init --starter vision|codebase`. By default files go under a `repoos/`
subdirectory; interactive prompts let you choose a different location or `/` for
the repo root. `repoos.toml` and `AGENTS.md` always stay at the root. Run outside
a git repo, it starts a guided new-project flow instead, which can launch the web
console for you. On an existing repo, an interactive run also offers to seed the
task-area vocabulary (and commented preview-target stubs for it) — skippable, and
skipped automatically once `[[areas]]` is declared. See
[Configuration](/configuration#areas).

`--docs-from` copies an existing doc set into `docsDir` (a directory, a single
file, or a `.zip`); `--force` overwrites collisions. The guided flow also prompts
for a path, then offers to scaffold starter docs. Nothing is imported or
scaffolded unless you pass the flag or answer yes. See `repoos docs` below.

#### Non-interactive new-project mode (for agents and scripts)

Outside a git repo with no TTY, `repoos init <name>` can't prompt, so it prints
the exact command to run and exits non-zero. Pass `--new` (or `--yes`) to run
the same guided flow with answers from flags and defaults — no pty tricks:

```bash
repoos init myproject --new \
  --description "A tiny social app for book clubs" \
  --areas web,api \
  --no-launch
```

| Flag | Meaning |
| --- | --- |
| `--new`, `--yes` | Run the new-project flow non-interactively. Required without a TTY. |
| `--description "<text>"` | Project description seeded into the starter task. |
| `--description-file <path>` | Read the description from a file; `-` reads stdin (multi-line markdown). |
| `--areas web,api` | Seed the area vocabulary (same comma-separated rule as the area picker). |
| `--layout <ns>` | `repoos` (default), `/` for the repo root, or a namespace path. |
| `--commit` / `--no-commit` | Make the initial commit of the scaffold (default: commit). |
| `--launch` / `--no-launch` | Start the web console when done (default: no launch without a TTY). |
| `--preview-stub` / `--no-preview-stub` | Scaffold commented `[[preview.targets]]` stubs for the areas. |
| `--dir <path>` | Where to create the project; alternative to the positional name. |
| `--force` | Scaffold into an existing non-empty directory. |
| `--json` | Print `{ root, tasks: [...], created: [...] }` instead of the human summary. |
| `--help` | Documented flags, and which apply to new vs existing repos. |

`--new` seeds the **new-project** starter ("Flesh out the product vision and
initial architecture"). Do **not** work around a missing TTY by running
`git init` first: inside a git repo, `repoos init` seeds the *existing-codebase*
starter ("Read this codebase…"), which is the wrong route for a brand-new
project.

When the repo has no check plan yet, init inspects its stack and writes a
starter plan to an uncommitted `repoos.check-plan.proposed.toml` for review;
interactive init offers to move it into `repoos.toml`. See
[Checks before merge](/check).

### `repoos upgrade [--channel beta|canary|rc]`

Self-updates a standalone (curl-installed) RepoOS to the latest release.
Tracks stable by default; `--channel` follows a prerelease line. Package-manager
installs are not modified: RepoOS detects the usual npm, Bun, pnpm, mise, and
Homebrew paths and prints the matching update command instead. `--channel`
applies only to the standalone curl install.

See [Updating RepoOS](/getting-started#updating-repoos) for every install method.

## The board

### `repoos new "<title>"`

Creates a task.

```bash
repoos new "Fix the login redirect loop" --type bug --area web --priority p1
repoos new "Redesign the onboarding flow" --area "web, onboarding"
repoos new "Build the settings screen" --depends-on 0542,0538
```

| Flag | Values |
| --- | --- |
| `--type` | `feature`, `bug`, `chore`, `spec`, `refactor` |
| `--priority` | `p0`, `p1`, `p2`, `p3` |
| `--area` | Free text, comma-separated for several (`--area web, core`). Areas a repo declares (`[[areas]]` in repoos.toml) appear in the task drawer's area picker; anything outside it stays allowed. |
| `--depends-on` | Comma-separated task ids that must be completed and merged into `main` first. |
| `--ai` | Assign to an AI agent |
| `--body` | Task body; pass `-` to read from stdin |

`--priority` and `--type` are validated on every write: a value outside the
sets above is rejected with the field, the bad value and the full list of valid
values (e.g. `priority 'medium' is not valid; use one of p0, p1, p2, p3`), and
is never silently defaulted. The same check applies to `repoos update` and the
HTTP API. Task files that already carry a legacy value (`priority: high`,
`type: ux`) still load and display as-is — only new writes are checked.

### `repoos list [status]`

Shows the board, or one column: `inbox`, `ready`, `active`, `review`, `done`.
Archived tasks are hidden by default (a count is printed at the bottom);
`repoos list archived` shows them with their reason.

### `repoos show <id>`

Prints a task's full spec — metadata, body, and activity log. An archived task
shows an `archived` row with its reason.

### `repoos mv <id> <status>`

Moves a task to a new status. Takes `--note "..."` to record why.

```bash
repoos mv 0001 ready --note "spec is settled, ready to hand over"
```

`review` is the one status with special behaviour, because reaching it means
running the checks, not just editing a field. From your terminal the move goes
through the same handoff finalization the UI uses — commit the branch, run
`repoos check`, pass the commit guard, then land in `review`. The task stays
`active` while that runs and stays `active` with the reason if the check fails;
the command itself still exits 0. See
[Review and close-out](/review-and-close-out).

Run from inside a RepoOS-managed agent session for that same task,
`repoos mv <id> review` records a **handoff request** instead of moving anything: the
runner picks it up when the turn ends and finalizes then. That is deliberate —
an agent moving its own task out of `active` would have its turn killed
mid-flight.

`done` is refused when the task's branch still exists and is not merged into
`main`; `repoos mv done` only flips the flag, it never merges. Use
`repoos done <id>` (the real close-out pipeline), **Move to done** in the UI,
or merge the branch yourself first.

For server-backed actions (start, pause, handoff, close-out, previews, config,
runners, running agents, board stats), use the **Control plane** commands below
instead of hand-rolled `curl` — they authenticate once (loopback token or stored
session, with transparent dev-login re-auth on 401).

An archived task is refused too: archiving is orthogonal to status, and the
only way back is to unarchive it (from the Archived list in the UI, or
`POST /api/tasks/:id/unarchive`).

## Control plane (running server)

These commands talk to the live RepoOS server (`repoos serve`). They reuse the
loopback CLI token when auth is on, or a stored session after dev-login, and
support `--json` on every command. Long operations accept `--wait` (review and
done wait by default in human mode).

| Command | API |
| --- | --- |
| `repoos start <id> [--fresh]` | `POST /api/tasks/:id/start` |
| `repoos pause <id>` | `POST /api/tasks/:id/pause` |
| `repoos message <id> "…"` | `POST /api/tasks/:id/message` |
| `repoos review <id> [--wait]` | `PATCH /api/tasks/:id` (`status: review`) |
| `repoos done <id> [--commit-dirty] [--wait]` | `POST /api/tasks/:id/done` |
| `repoos override <id> --cli X --model Y` | `PATCH /api/tasks/:id` |
| `repoos preview <id> [--stop]` | `POST /api/tasks/:id/preview` (+ `/stop`) |
| `repoos config get\|set <key> [value]` | `GET` / `PATCH /api/config` |
| `repoos runners [--probe]` | remote-validation status + test |
| `repoos agents` | `GET /api/agents/running` |
| `repoos stats` | `GET /api/stats/board` |
| `repoos decisions` (`repoos attention`) | `GET /api/decisions` — CTO escalation digest with cause, evidence, and actions |
| `repoos driver brief` | `GET /api/driver/brief` — the CTO board brief from live state (#0731) |

Pass `--port N` when the server is not on the default port. If the server is
down, the CLI exits with a clear message instead of a generic fetch error.

### `repoos update <id>`

Edits a task's metadata or body: `--title`, `--area`, `--story`,
`--depends-on`, `--priority`, `--type`, `--body`, `--branch`, `--assigned-to`,
`--needs-input`, `--needs-merge`, and per-role agent pins (`--agent`, `--cli`,
`--model`, plus `--pm-*` and `--review-*` variants). These write the same
fields as `PATCH /api/tasks/<id>` and are what engineer/reviewer runs read.
`POST /api/tasks/<id>/start` and `/message` reject override fields in the
request body (HTTP 400); PM chat routes still accept `cliOverride` /
`modelOverride` for a single turn. See [Running with agents](/running-with-agents#2-choose-agents-per-role).

```bash
repoos update 0615 --depends-on 0542,0538
repoos update 0615 --depends-on ""
repoos update 0316 --needs-input false
repoos update 0397 --needs-merge false
```

The `--needs-input` / `--needs-merge` flags take `true` or `false`, and clearing
the flag also clears the reason/detail recorded alongside it.

Dependencies are satisfied only when the upstream task is `done` and Git
confirms its merged commit is an ancestor of `main`. A blocked task cannot be
started manually unless you explicitly confirm the override; missing or
unverifiable upstream tasks are marked as needing a human. Unknown ids,
self-dependencies, and cycles are rejected when written.

To declare evidence screenshots, pass raw JSON to `--shots`. The CLI validates
every entry and writes the fenced `## Shots` section itself, leaving the rest of
the body (including the Activity log) untouched. `repoos new` accepts it too;
`-` reads the JSON from stdin:

    repoos update 0612 --shots '[{"target":"default","route":"/agents?tab=detected","label":"Detected tab","highlight":".detect-row"}]'

To replace any other single `## Section` (create it if absent), use
`--section "<heading>" --section-body "..."`. A `Shots` section written this way
must be a fenced JSON list, and malformed content is rejected rather than
silently falling back to a `/` capture. `--shots` cannot be combined with
`--section` or `--body`.

A full `--body` replace that would drop Problem / Desired UX / Acceptance
criteria / Notes for AI is refused unless `--force` is passed; the error points
at the `--section` form.

### `repoos note <id> "<text>"`

Appends a free-form note to the task's activity log. Useful for leaving context
an agent should read before picking the task up.

### `repoos new-doc "<description>"`

Creates a document from a description, via the Product Manager agent.

### `repoos docs import <dir|file|.zip> [--force] [--dry-run]`

Copies an existing doc set into `docsDir`, preserving folder structure. The
source may be a directory, a single file, or a `.zip` archive (common for a
browser download): an archive is extracted to a temp directory first, a lone
top-level folder is unwrapped so you don't get an extra level, and macOS junk
(`__MACOSX/`, `.DS_Store`, `._*`) is ignored. Archives that try to escape the
extraction directory (zip-slip), contain symlinks, or are absurdly large or
numerous are refused. Existing files are left untouched and reported unless
`--force` is passed; `--dry-run` prints the plan and writes nothing.

### `repoos docs scaffold`

Writes a minimal, opt-in starter skeleton into `docsDir`: an index `README.md`
with a reading order and an "if you learn something durable, write it here"
line, plus short `product.md`, `architecture.md`, `conventions.md` and
`glossary.md` stubs with prompts. It never overwrites an existing file, and
nothing is created unless you run the command (or answer yes to the scaffold
prompt in the guided `repoos init` flow).

## Running it

### `repoos serve [--port N]`

Starts the local server — web UI, API, and live event stream. Without `--port`
it uses `servePort` from `repoos.toml`, or a stable port derived from the repo's
path so separate repos never collide.

### `repoos stop [--port N]`

Stops this repo's server, identified by its own lockfile. It will not touch a
server belonging to a different repo.

### `repoos status [--json]`

One-screen health snapshot: server, build freshness, board counts, worktrees,
tunnel, and git state.

The `server` line names the *running server's* own RepoOS version and build
(`v0.5.66 (build abc1234)`), and when that build differs from the installed CLI's
it prints a warning — `server is older than the installed CLI … restart to pick
up fixes` — with the command that restarts it (`repoos service restart` for a
managed service, `repoos serve` for a hand-run process). The `build` line
describes this checkout, so in a project repo it reads `no RepoOS build` rather
than implying the repo is a RepoOS source checkout. `--json` exposes `cli` and
`server.buildState` (`same`/`stale`/`unknown`) so scripts can detect a stale
server without parsing text.

### `repoos doctor [--json] [--verbose] [--probe <cli> [--model <id>]] [--binary <path>]`

A read-only readiness preflight for a real project. It checks the repository
identity (root, git, linked worktree), parses and validates `repoos.toml`,
verifies the configured layout and existing task frontmatter, detects the
required runtimes and enabled agent CLIs, explains whether a meaningful
`repoos check` plan is configured, and reports server, auth and credential
readiness — each with a stable finding id, a severity (`pass` / `warn` / `fail`)
and a concrete next step. It also reports each enabled harness's compatibility
contract status (verified, upgrade recommended, newer than verified, unsupported,
or not yet probed).

It also runs an advisory **docs-wiring** check and warns when `AGENTS.md` never
points at the docs index (`docsDir/README.md`), when docs exist that the index
doesn't link to, or when the docs directory is empty while tasks exist. These are
always warnings with a one-line fix hint — they never change the exit code. See
[Give the project docs](/getting-started#give-the-project-docs).

```bash
repoos doctor            # warnings/failures, summary and next steps
repoos doctor --verbose  # every check, including the passing ones
repoos doctor --json     # the same findings, machine-readable
```

By default the report **collapses passing checks** so a single failure isn't
buried under ~25 green lines: only sections with warnings or failures are listed,
followed by the summary and the next steps (failures first), and a closing hint
that `--verbose` shows the whole checklist. `--json` is unaffected — it always
emits every finding. Output is laid out for the terminal width and wraps cleanly
when piped, so the default run never breaks its own indentation. The default run
never initializes, rewrites config, installs, logs in, contacts a model provider,
kills a process or mutates git, and it works offline. It exits non-zero when any
finding is a failure, so it is usable in a script. Paste `repoos doctor` output
into an issue to report a setup problem.

```bash
repoos doctor --probe opencode --yes   # run the live adapter-contract probe
```

`--probe <cli>` is a separate, explicitly **opt-in** mode: it runs the named
harness's adapter-contract suite against the installed binary inside an isolated
temporary directory, then cleans up. Unlike the default report it starts real
harness runs, so it **may use provider credentials and spend tokens** (the
one-shot, resume and cancellation seams each start a run). It refuses to run
headless without `--yes`, and it never reads task files, prompts or project
content. `--model <id>` optionally pins the model used for the probe's runs (e.g.
`--probe pi --model openrouter/deepseek/deepseek-v4.1-flash`), for harnesses
whose default model depends on your environment; it is ignored by harnesses
that have no model flag. See [Coding harness compatibility](./coding-harness-compatibility.md).

### `repoos support bundle` / `repoos support inspect`

Creates a small, inspectable, **redacted** diagnostic archive to attach to an
issue when RepoOS fails on a real-world project. It is built locally and never
uploaded; opening a browser, copying to the clipboard or filing an issue are all
separate, explicit actions you take yourself.

```bash
repoos support bundle                   # write .repoos/support/repoos-support-<ts>.tar.gz
repoos support bundle --dry-run         # show exactly what would be included; write nothing
repoos support bundle --out /tmp/x.tar.gz
repoos support inspect <bundle.tar.gz>  # list every file inside an existing bundle
```

The bundle contains a versioned structured report: RepoOS version/build metadata,
platform/runtime versions, the effective configuration *shape* (flags, counts,
schema versions — never secret values or free-form fields), agent/tool detection
and versions, the resolved check plan, the sanitized `repoos doctor` findings,
the classified result of the latest doctor run, server/health/lifecycle
diagnostics, bounded recent error messages, and a machine-readable
`manifest.json` listing every file, its size and hash, the collection time and
the redaction rules/version.

It never includes `.env`, environment values, API tokens, passwords, cookies,
SSH keys, session material, prompts, transcripts, task bodies, source code,
diffs, attachments or raw logs. Home directories and the repo root are minimized
to `~` and `<repo>`. A final scan verifies no known secret shape or private path
survived; a miss **aborts** the write rather than packaging it. A down server, a
missing agent CLI or an unparseable `repoos.toml` degrade that one section into
an explicit omission with the reason, and the rest of the bundle is still
written. The default output lands under the cache directory (gitignored in most
repos); if that path is inside the repo and not gitignored, both the CLI and the
UI warn that the archive could be committed and suggest `--out` or a
`.gitignore` entry. In the web UI it is on **Settings → Support**, and a
**Create a redacted support bundle** action also sits on the failed
Move-to-done / check panel — the moment you're most likely to need it.

## Quality and maintenance

### `repoos check`

The definition-of-done gate. It runs the check plan your repo declares in
`repoos.toml` — for any stack (see [Checks before merge](/check)). Exits
non-zero on any failure, so it works in CI as well as locally.

```bash
repoos check --profile full      # every declared step, including slow ones
repoos check --changed main      # fast pre-review pass over changed paths
repoos check --print-plan        # print the resolved plan as [[check.steps]]
repoos check --fix               # run each format step's fixer before its check
repoos check --step tests        # run only the named step(s), to re-check one
```

Every run ends with a short failed-steps summary naming each failed step and the
`repoos check --step <name>` command that reruns it. `--fix` never applies at
close-out, so an unformatted committed tree still fails the merge gate.

### `repoos outline <file>`

Prints a compact map of a source file — top-level and exported functions,
classes, interfaces, types, enums and constants with their `start-end` line
numbers; for `.vue`, the template/script/style block ranges plus script symbols;
for `.css`, its top-level selectors and at-rules. Run it once before reading a
large file, then read only the range you need (`offset`/`limit`) instead of the
whole file.

Supported: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.vue`, `.css`.
Anything else prints one clear line saying so. `--json` emits the same data as
JSON.

```bash
repoos outline src/server/server.ts
repoos outline src/ui-app/src/components/TaskDrawer.vue
repoos outline src/ui-app/src/style.css --json
```

### `repoos shot`

Captures screenshots of a task's managed preview so a UI change leaves visual
evidence a reviewer or human can actually look at, instead of "it looked fine".
Run it from the task's worktree; it asks the running `repoos serve` to start the
task's preview (never starting a server itself), drives the same optional
Playwright/WebKit path the UI check uses, and stores PNGs under
`work/.attachments/<taskId>/shots/` — gitignored, never referenced from the task
body, and shown as the **UI changes** section of the drawer's Changes tab. This
is the default local attachment storage; an opt-in cloud provider is configured
under [`storage.provider`](/configuration#attachment-storage).

```bash
repoos shot                          # capture the preview root for this task
repoos shot /repo/commits/abc123     # capture one route
repoos shot --target "Docs site"     # force a target (skip path/area resolution)
repoos shot --selector ".sidebar"    # capture one element instead of the page
repoos shot --wait 2000              # wait longer before capturing (default 900ms)
repoos shot https://example.test/x   # capture an arbitrary URL
```

After the page loads, `repoos shot` waits for network quiet (best-effort) and a
short settle before capturing, so a dev server's client-mount spinner is not
what gets recorded. Raise `--wait <ms>` for a page that renders slower than
that.

Which target(s) to capture is decided from the files the task changed, matched
against `[[preview.targets]].paths` globs in `repoos.toml` — not the task's
up-front `area:`. The default (main-app) preview can declare its own globs as
`paths` under `[preview]` (this repo: `src/ui-app/**`), so an app diff resolves
it too and a mixed app+docs diff captures both. If nothing matches, it falls
back to area resolution; `--target` overrides. Each shot records its resolved
target name. The drawer warns whenever the changed paths touch a target the
task's `area` does not resolve to, so a mislabeled area becomes visible rather
than silently screenshotting the wrong app. Only one preview runs per task, so
a multi-target capture restarts the preview between targets (stopping one you
may be watching) — the command prints a note when it will do that.

#### The task's `## Shots` list

A change inside a drawer, modal or filled form is not visible from `/`, and you
are the one who knows which page/state shows it. Declare it in the task body —
a `## Shots` section holding a fenced JSON list, one entry per shot:

```json
[
  {
    "target": "default",
    "route": "/",
    "label": "New-task drawer open",
    "highlight": "form.new-task .title-input",
    "steps": [
      { "click": "button[data-test-id='new-task']" },
      { "waitMs": 300 }
    ]
  }
]
```

Each entry takes `target` (a resolved preview target name; omitted means the
default target), `route` (default `/`), an optional `selector` (capture one
element), a human `label` shown as the shot's caption in the Changes tab, an
optional `highlight` CSS selector — every element it matches is outlined in
the capture, pointing the reviewer at what changed — and optional ordered
`steps` — `{ "click": "<selector>" }`, `{ "fill": "<selector>", "text":
"..." }`, `{ "waitFor": "<selector>" }` or `{ "waitMs": 300 }` — using plain
CSS selectors or test ids, no framework knowledge. Say what changed: a label
naming the change and a highlight on the changed element are the difference
between a reviewer reading "New-task drawer open" and squinting at a full
page.

`repoos shot` captures this list, and the SERVER does too: declared shots are
captured automatically when a task moves to review, with targets resolved the
same way the CLI resolves them — the diff's changed paths first, then the task's
`area`, then the default `[preview] command`. The automatic capture is
deliberately conservative when nothing is declared (#0603): a fallback
shot's caption records the glob that matched (`auto: matched src/ui-app/**`),
a declared shot's caption records its label (`declared: New-task drawer
open`); a diff touching only tests or task notes touches a glob but is not a
UI change, so nothing is captured without a declaration (test files are not
UI evidence); and a docs target matched only by content files is skipped
unless a declared shot names a route — the docs home page does not show a
wording edit. (Repos whose UI is itself markdown-driven: a genuine UI change
in a `.md` file counts as content, so declare the shot with its route.) Skips
and failures are recorded in the task log and activity as
`shots: skipped — <reason>` / `shots: failed — <reason>`, never as a failed
handoff; skips that ride alongside a captured shot appear in the same note.
An engineer-made capture pre-empts the automatic one.

Typing a route (or passing `--selector`) on the command line replaces the
declared list for that run, and applies to every resolved target — a typed
route is captured, not deferred to the `/` fallback (#0610). The declared
entries are not re-pointed at it: each one carries `steps`, a `highlight` and
a `label` written for its own route, so moving entry #2 to a route you just
typed would click selectors that may not exist there. A route you name also
counts as the justification the docs-content skip asks for, so
`repoos shot /configuration --target "Docs site"` captures the page you asked
for instead of standing down. The command prints the plan it will shoot
(`plan: default /settings – …`) before it starts a browser.

Playwright/WebKit is optional (a dev dependency). When it is missing, `repoos
shot` prints install advice and exits non-zero without touching anything:
`bun add -d @playwright/test && bunx playwright install webkit`. A screenshot
is the one sanctioned use of the managed preview by an engineer agent, and only
for UI-visible changes — see [Review and close-out](/review-and-close-out).

### `repoos index [--json]`

Rebuilds the derived index cache. The cache is disposable — the markdown files
are the source of truth — so this is safe to run any time.

### `repoos gc [--yes|--dry-run]`

Reclaims leaked task worktrees and branches. Conservative by default: it only
removes worktrees that are merged and clean, and reports anything holding real
uncommitted or unmerged work rather than deleting it.

### `repoos tunnel <subcommand>`

Publishes local apps through Cloudflare Tunnel + Zero Trust:
`setup`, `create`, `allow`, `deny`, `start`, `install`, `stop`, `list`, `status`.
