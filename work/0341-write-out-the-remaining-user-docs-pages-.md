---
id: "0341"
title: Write out the remaining user-docs pages for docs.repoos.org
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-13T15:12:36Z"
updated_at: "2026-09-13T15:12:36Z"
---
`user-docs/` (docs.repoos.org) was split out of `docs/` and seeded with four
pages: `getting-started`, `concepts`, `cli`, `configuration`. This task fills
out the rest.

## The audience (read this first)

These docs are for someone **adopting RepoOS in their own repo** — not for
someone working on RepoOS's codebase. That distinction is the whole reason
`user-docs/` exists separately from `docs/`; see `user-docs/README.md` and
`docs/README.md`. Do NOT republish or copy `docs/*.md` here: those are build
context for this project (architecture internals, incident history, ADRs) and
a new user has no reason to read them. Where the same subject appears in both,
they are different documents written for different readers.

## Pages worth adding

- **Agents** — configuring coding agents (which CLIs are supported, model
  selection, the Agents page), plus what the PM / engineer / reviewer roles
  actually do.
- **The review gate** — what `review` means, what the reviewer agent produces,
  how sign-off and merge-to-trunk work, and why an agent can't merge itself.
- **`repoos check`** — what the gate runs, how to make it meaningful in a repo
  that isn't RepoOS (it currently assumes this project's own build/test
  commands — be honest about what's configurable and what isn't).
- **Working with an existing repo** — what `repoos init` adds, what it doesn't
  touch, and how to adopt it incrementally.
- **Troubleshooting / FAQ** — the questions a new user actually hits. Two
  worth covering: running RepoOS in more than one repo at once (per-repo
  derived ports, `repoos stop`), and picking a runtime (`REPOOS_RUNTIME`).
- **Tunnels** — publishing a local instance via Cloudflare Tunnel, and the
  mobile app connecting to it.

## Constraints

- The sidebar in `user-docs/.vitepress/config.mts` is hand-curated — VitePress
  does not generate it from the file tree. A new page must be added there or
  it will not appear in navigation.
- Verify locally with `just user-docs-dev` / `just user-docs-build`. Note that
  `repoos check` does NOT cover this directory (it's hardcoded to the root
  package.json + src/ui-app), so a green check proves nothing here.
- Write accurately: check claims against the actual CLI and `src/core/config.ts`
  rather than inferring. Where behavior is this-repo-specific rather than
  general RepoOS behavior, say so or leave it out.

## Activity

- 2026-09-13T15:12:36Z · created · unknown
