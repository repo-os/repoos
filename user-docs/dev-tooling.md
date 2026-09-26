# Dev tooling

RepoOS ships a few features meant only for people hacking on RepoOS itself (or
running it from a linked source checkout), not for production installs of the
npm package.

## Copy inspector

When `dev.inspector.enabled` is on (default) and the server is a dev build, hover
any visible UI string to reveal a **⌖** control. Click it to open a small panel
showing the repo-relative source path (with a `:line` suffix when known).

- **Copy path** — puts `src/ui-app/…:line` on the clipboard; works without an
  editor configured.
- **Open in editor** — runs the command from `dev.inspector.editorCommand`
  (Settings → Advanced), substituting `{file}` and `{line}`. The server spawns the
  command as an argv array (no shell).

Release builds (`REPOOS_SHIP=1` during `bun run build`, as used for npm publish)
strip template attribution from the UI bundle and the open-in-editor API returns
404.

Configuration keys are documented in [repoos.toml reference](/configuration#dev-copy-inspector-repoos-self-host-only).
