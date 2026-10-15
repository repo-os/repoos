# Open in editor

RepoOS can launch a locally configured editor for task specs, context docs, and
failed test files. The feature is gated by configuration, not by the dev-only
copy-inspector build.

## Security boundary

- `editor.command` is the general setting; `dev.inspector.editorCommand` still
  overrides it when set.
- Only the configured command template is ever executed. The template is parsed
  into an argv array without a shell, so request payloads cannot inject commands.
- The route only opens paths that resolve, via `realpath`, inside the repo root
  and that are one of: task markdown under the configured `workDir`, markdown
  under the configured `docsDir`, or test files (`*.test.*` / `*.spec.*`).
  Symlinks escaping the repo are rejected.
- Opening local files is allowed on normal (non-dev) installs when an editor
  command is configured. On dev builds the copy-inspector's editor override takes
  precedence.
