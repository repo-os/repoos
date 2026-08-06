# Architecture

## Layers

- `src/core` — the engine: task parser, frontmatter schema, status model,
  config loading, live in-memory index.
- `src/server` — HTTP + SSE server. Clients subscribe to repo events; the
  index pushes change frames over one long-lived connection.
- `src/ui` — the single-file web UI (Vue 3 + Tailwind v4), served from
  `dist/ui/`.
- `src/commands` — the CLI (`list`, `serve`, `check`, …) that powers the
  agent-facing loop.

## Design constraints

- Zero runtime dependencies.
- The repo is the source of truth: every mutation is a markdown edit.
