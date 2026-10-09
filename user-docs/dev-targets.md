# Dev targets

A **dev target** is something you run yourself while developing: a local HMR web
server, a debug build, a preview bundle. RepoOS can start, stop and restart each
one for you and keep it running while you work, so you don't have to keep a
terminal open for every process.

Dev targets are distinct from **task previews**. A preview is a temporary
instance RepoOS starts from a task's worktree to show a change under review; it
lives on the task. A dev target is what *you* start for your own development, in
the project's root checkout, and it stays up until you stop it.

Declare the targets in the project's committed `repoos.toml`. Only commands
declared there can ever run — nothing you type in the UI becomes a command, and
no API request body can supply one. That is the whole trust boundary of the
feature.

## The four fields

Every target has four fields, plus two optional ones:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string | yes | Stable identity. Unique within the project; the API, CLI and UI address the target by it. |
| `kind` | `server` \| `artifact` | yes | A `server` is a long-lived process with a URL. An `artifact` is a build that produces a file and exits. |
| `command` | string | yes | The shell command, run in the project's **root checkout** — never a task worktree. |
| `url` | string | for `server` | The server's URL, e.g. `http://localhost:5173`. Shown as the open-URL link. |
| `artifactPath` | string | for `artifact` | Repo-relative path of the build output, e.g. `dist/app-debug.apk`. |
| `label` | string | no | A human label shown in the UI. Defaults to `name`. |
| `healthCheck` | table | no | When the target counts as healthy — see below. |

## The health check

A process that has spawned is not necessarily ready. A Vite server answers a
moment after it starts; a build writes its output at the end. A health check
tells RepoOS when to call a target ready instead of guessing:

- `healthCheck.url` — a URL polled until it answers. Use it for a `server`.
- `healthCheck.file` — a repo-relative file that must exist. Use it for an
  `artifact`.

Leave `healthCheck` out and a `server` is reported running as soon as its
process is alive, and an `artifact` when its command exits successfully. A
target that never satisfies its health check is reported `failed` rather than
`running`.

```toml
[[dev.targets]]
name = "web"
kind = "server"
command = "bun run dev"
url = "http://localhost:5173"
label = "Web app"
healthCheck = { url = "http://localhost:5173/health" }
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
healthCheck = { url = "http://localhost:5173/health" }
```

An Android debug build that produces an APK:

```toml
[[dev.targets]]
name = "apk"
kind = "artifact"
command = "./gradlew assembleDebug"
artifactPath = "app/build/outputs/apk/debug/app-debug.apk"
label = "Debug APK"
healthCheck = { file = "app/build/outputs/apk/debug/app-debug.apk" }
```

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
`running`, `stopped`, `starting` or `failed`, and the last ~200 lines of its
combined output are available.

## See also

- [Configuration](/configuration) — the full `repoos.toml` reference, including
  the `[[dev.targets]]` keys.
- [CLI reference](/cli) — the `repoos dev` commands.
