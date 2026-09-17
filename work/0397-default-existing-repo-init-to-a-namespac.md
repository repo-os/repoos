---
id: "0397"
title: Default existing-repo init to a namespaced RepoOS directory
type: feature
status: inbox
priority: p1
area: init
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-17T14:26:27Z"
updated_at: "2026-09-17T14:26:27Z"
---
## Problem

When RepoOS is added to an existing Git repository, `repoos init` currently scaffolds `work/`, `docs/`, and `.repoos/` at the repository root without asking. That makes RepoOS look like project source rather than repository metadata, can clutter mature repositories, and hides the namespaced layout that new-project init already supports.

## Goal

Make a namespaced `repoos/` directory the default layout when initializing an existing repository, while letting the user choose a different metadata directory or explicitly choose the repository root.

`repoos.toml` and `AGENTS.md` must remain at the repository root in every layout: they are the RepoOS project marker and the conventional agent-instruction entrypoint.

## Required interaction

For an interactive existing-repo `repoos init`:

- Prompt before scaffolding: `Where should RepoOS files live? [repoos/]`
- Enter accepts the new default `repoos/`.
- A user may type another safe repository-relative directory name, such as `.meta/repoos/`, if it does not escape the repository root.
- Explicitly explain that entering `/` chooses the repository root layout (`work/`, `docs/`, and `.repoos/` at root).
- Show the resolved layout in the confirmation preview before creating files.
- Preserve the existing opt-in AGENTS.md appendix preview/approval flow and ensure its wording points to the configured task/docs locations rather than assuming root `work/` and `docs/`.

For non-interactive initialization of a previously uninitialized Git repository, use the new `repoos/` default without blocking. Do not invent a prompt or require a TTY.

## Layout contract

With the default selection, scaffold:

```text
repoos.toml
AGENTS.md
repoos/
  work/
  docs/
  .repoos/   # derived cache, ignored
```

The root config should persist the selected paths, for example:

```toml
workDir  = "repoos/work"
docsDir  = "repoos/docs"
cacheDir = "repoos/.repoos"
```

The root option must preserve the current root-path behavior. The selected directory is a layout namespace, not a custom RepoOS project root: discovery still uses root `repoos.toml`.

## Compatibility and safety

- Never move or rewrite an existing RepoOS installation. If root `repoos.toml` already exists, respect its configured paths and retain current idempotent behavior.
- Never overwrite an existing `repoos/` or user-selected directory. Detect collisions and provide a clear recovery choice/error.
- Validate paths: reject absolute paths other than the special `/` root choice, parent traversal, paths outside the repo, and unsafe/invalid input.
- Keep `.gitignore` accurate for the selected cache path and existing root-layout projects.
- Make template task text, generated AGENTS.md, output summaries, docs, and any first-run hints reflect the selected layout.
- Existing users should not need a migration; this affects newly initialized repositories only.

## Documentation

Update existing-repo onboarding and configuration/layout documentation to recommend the namespaced default, show the root alternative, and explain why `repoos.toml` and `AGENTS.md` stay at root.

## Acceptance criteria

- Interactive `repoos init` in an existing Git repo defaults to `repoos/`, lets the user choose a safe custom directory, and explicitly supports `/` for root.
- The confirmation preview accurately lists the paths that will be created.
- The default namespaced layout works end-to-end: tasks, docs, cache, discovery, CLI commands, server, and generated starter content all use the configured paths.
- Root layout remains available and behaves as before.
- Existing installations are never relaid out or modified unexpectedly.
- Non-interactive init is deterministic and uses the namespaced default only for a fresh installation.
- Tests cover default, root, custom namespace, invalid path, collision, idempotent existing setup, and generated config/AGENTS.md content.

## Activity

- 2026-09-17T14:26:27Z · created · unknown
