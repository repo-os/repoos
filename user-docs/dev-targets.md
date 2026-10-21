# Dev targets

A **dev target** is something you run yourself while developing: a local HMR web
server, a debug build, a native app process you want running, a preview bundle.
RepoOS can start, stop and restart each one for you and keep it running while
you work, so you don't have to keep a terminal open for every process.

Dev targets are distinct from **task previews**. A preview is a temporary
instance RepoOS starts from a task's worktree to show a change under review; it
lives on the task. A dev target is what *you* start for your own development, in
the project's root checkout, and it stays up until you stop it.

Declare the targets in the project's committed `repoos.toml`. Only commands
declared there can ever run — nothing you type in the UI becomes a command, and
no API request body can supply one. That is the whole trust boundary of the
feature.

## Fields

Every target has a `name`, a `kind` and a `command`; the rest are optional and
depend on the kind:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string | yes | Stable identity. Unique within the project; the API, CLI and UI address the target by it. |
| `kind` | `server` \| `artifact` \| `process` | yes | A `server` is a long-lived process with a URL. An `artifact` is a build that produces a file and exits. A `process` is a long-lived foreground process with no URL and no build artifact — a native macOS app, a daemon. |
| `command` | string | yes | The shell command, run in the project's **root checkout** — never a task worktree. |
| `url` | string | for `server` | The server's URL, e.g. `http://localhost:5173`. Shown as the open-URL link. |
| `port` | number | no | The port used for `{port}`. With auto-pick on it is the **preferred** port (used when free); with auto-pick off it is the **fixed** port. |
| `autoPort` | boolean | no | Auto-pick a free port for `{port}`. Default `true`. Set `false` to pin the target to `port` and let a clash fail. |
| `artifactPath` | string | for `artifact` | Repo-relative path of the build output, e.g. `dist/app-debug.apk`. |
| `label` | string | no | A human label shown in the UI. Defaults to `name`. |
| `healthCheck` | table | no | When the target counts as healthy — see below. Not used for a `process`. |

Every row needs some way to be judged healthy: a `server` needs a `url` (and
may add a `healthCheck`), an `artifact` needs an `artifactPath`, and a `process`
is healthy while its process is alive — which is its health check. A `server`
without a `url` is rejected with a pointer to `kind = "process"`, and a
`process` cannot carry a `url`, an `artifactPath` or a `healthCheck`.

## The health check

A process that has spawned is not necessarily ready. A Vite server answers a
moment after it starts; a build writes its output at the end. A health check
tells RepoOS when to call a target ready instead of guessing:

- `healthCheck.url` — a URL polled until it answers. Use it for a `server`.
- `healthCheck.file` — a repo-relative file that must exist. Use it for an
  `artifact`.

Leave `healthCheck` out and a `server` is reported running as soon as its
process is alive, and an `artifact` when its command exits successfully. A
`process` has no health check: it is reported running as soon as its process is
alive, and stays running while it lives. A target that never satisfies its
health check is reported `failed` rather than `running`.

```toml
[[dev.targets]]
name = "web"
kind = "server"
command = "bun run dev"
url = "http://localhost:5173"
label = "Web app"
healthCheck.url = "http://localhost:5173/health"
```

## Examples

A local HMR web server that is ready when its app responds:

```toml
[[dev.targets]]
name = "web"
kind = "server"
command = "bun run dev"
url = "http://localhost:5173"
label = "Web app"
healthCheck.url = "http://localhost:5173/health"
```

A local HMR web server whose port RepoOS chooses, so it never clashes with
another app on the machine. **Auto-pick a free port** is on by default: `{port}`
in the command, `url` and `healthCheck` is replaced with the same port, and the
Dev page shows the real URL it bound:

```toml
[[dev.targets]]
name = "web"
kind = "server"
command = "bun run dev --port {port}"
url = "http://localhost:{port}"
label = "Web app"
healthCheck = { url = "http://localhost:{port}/health" }
```

Set `port` to state a **preferred** port: RepoOS uses it when it is free and
falls back to a free one when it is taken. Turn `autoPort` off to pin the target
to a **fixed** port instead — a clash then fails with the plain-language summary
that names the process holding the port, rather than being moved:

```toml
[[dev.targets]]
name = "web"
kind = "server"
command = "bun run dev --port {port}"
url = "http://localhost:{port}"
port = 5173
autoPort = false          # use 5173 as-is; a clash fails with the summary
```

Auto-pick only ever picks a port — it never stops another process. Only a process
RepoOS itself started can be stopped (the **Stop** action in the failure
summary).

An Android debug build that produces an APK:

```toml
[[dev.targets]]
name = "apk"
kind = "artifact"
command = "./gradlew assembleDebug"
artifactPath = "app/build/outputs/apk/debug/app-debug.apk"
label = "Debug APK"
healthCheck.file = "app/build/outputs/apk/debug/app-debug.apk"
```

A native macOS app that runs in the foreground with no URL and no build output —
Divot's menu bar app:

```toml
[[dev.targets]]
name = "divot"
kind = "process"
command = "swift run --package-path macos divot"
label = "Divot bar"
```

It is reported `running` while the process is alive; stop it from the Dev page
or `repoos dev divot stop`, and `Restart` re-runs the command (which rebuilds and
relaunches). Its last output lines are shown just like a server's.

## Editing targets

Two ways to edit the list, both writing the same `[[dev.targets]]` rows:

- **Settings → Advanced → Dev targets.** Add, edit, reorder and remove rows in
  the UI. Validation errors appear inline as you type, and the change is written
  through the config API — never by hand. The same parser validates the list
  server-side, so the form can never save a row the loader would reject.
- **`repoos.toml` directly.** Hand-write the `[[dev.targets]]` tables. A row the
  parser cannot use — a missing `name` or `command`, an unknown `kind`, a
  duplicate name, or a conflicting field such as a `url` on an `artifact` — is
  reported as a clear validation error (in Settings and on the Dev page) rather
  than silently dropped.

## Running targets

Start, stop and restart a target from the **Dev page**, or from the CLI:

```bash
repoos dev list
repoos dev web start
repoos dev web stop
repoos dev web restart
repoos dev web status
repoos dev web logs
```

A started target runs in the project's root checkout, detached from the server's
own lifetime: it keeps running after you close the browser, and stops only when
you ask, when the server stops, or when it crashes. Its state is one of
`running`, `stopped`, `starting` or `failed`, and the last 2000 lines of its
combined output are available in a scrollable panel. The panel opens six lines
at a time and scrolls for the rest; it starts minimised after a clean run and
opens automatically when the last run failed, so the error is visible. Your
expand/collapse choice is remembered per target when you leave the page or
reload. A running target also shows how long ago it started — "17 hours ago"
beside its state — and hovering or focusing that time reveals the exact start
timestamp. A started target's card carries a soft cyan glow — the same highlight
an active remote runner shows while it runs checks — so a running target stands
out from a stopped one at a glance.

When a target fails, the Dev page shows a plain-language summary above the log:
what failed, the most likely cause, and how to fix it. A port already in use is
detected from the output and, when it can, names the process holding the port —
its PID and command — with a **Stop** action for a process RepoOS started. A
`{port}` target avoids that entirely while auto-pick is on (the default); turn it
off with `autoPort = false` when you need a fixed port. Enable the optional
AI-written summary under **Settings → Advanced → Dev failure summaries**.

## Missing dependencies

A target's `cwd` is its own project directory. If that directory has a
`package.json`, it needs its own `node_modules` — a fresh task worktree has
none, and an older install can predate a dependency added to `package.json`.
Starting the target then fails with `ERR_MODULE_NOT_FOUND` even though the
command itself is correct.

`repoos doctor` reports this as **A dev or preview target is missing its
installed dependencies** and gives the exact fix, for example:

```bash
cd user-docs && bun install
```

The check is read-only — doctor never installs anything for you.

## See also

- [Configuration](/configuration) — the full `repoos.toml` reference, including
  the `[[dev.targets]]` keys.
- [CLI reference](/cli) — the `repoos dev` commands.
