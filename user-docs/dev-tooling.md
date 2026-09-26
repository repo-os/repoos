# Dev tooling

RepoOS ships a few features meant only for people hacking on RepoOS itself (or
running it from a linked source checkout), not for production installs of the
npm package.

## Copy inspector

When `dev.inspector.enabled` is on (default) and the server was built with `devUi: true` in `dist/.build-info.json`, hold **Alt** (Option on macOS) over visible UI text to reveal a pill showing the `File.vue:line` next to the pointer (the exact template element it points at is outlined), then click the pill — or press **Enter** — to open a panel with the repo-relative source path (with a `:line` suffix when known).

It only appears over plain text that comes from a RepoOS template — not over buttons, inputs, links or
icons, and not over text that comes from data (task titles, file contents).

- **Copy path** (`C`) — puts `src/ui-app/…:line` on the clipboard; works without an
  editor configured.
- **Open in editor** (`Enter`) — runs the command from `dev.inspector.editorCommand`
  (Settings → Advanced), substituting `{file}` and `{line}`. The server spawns the
  command as an argv array (no shell).
- **Close** (`Esc`).

The shortcuts work without the mouse: with the pill showing, **Enter** opens the popup;
then **Enter** opens the editor, **C** copies the path and **Esc** closes it. They are
ignored while you are typing in a field, and `Cmd/Ctrl+C` still copies selected text.

Release builds (`REPOOS_SHIP=1` during `bun run build`, as used for npm publish)
strip template attribution from the UI bundle and the open-in-editor API returns
404.

Configuration keys are documented in [repoos.toml reference](/configuration#dev-copy-inspector-repoos-self-host-only).
