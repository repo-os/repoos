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
model_override: opencode-go/mimo-v2.5
review_model_override: opencode-go/hy3
created_at: "2026-09-17T14:26:27Z"
updated_at: "2026-09-17T14:52:04Z"
---
## Problem

`repoos init` currently defaults to putting `work/`, `docs/`, and `.repoos/` at the repository root. That makes RepoOS look like project source rather than repository metadata, can clutter mature repositories, and makes the namespaced layout hard to discover.

The desired product default is the same for every fresh RepoOS initialization: whether `repoos init` is adding RepoOS to an existing Git repository or creating a new project, RepoOS metadata should live under `repoos/` unless the user chooses another location.

## Goal

Make a namespaced `repoos/` directory the new default layout for every fresh `repoos init` flow. Let the user choose a different safe repository-relative directory or explicitly choose the repository root.

`repoos.toml` and `AGENTS.md` must remain at the repository root in every layout: they are the RepoOS project marker and the conventional agent-instruction entrypoint.

## Required interaction

For every interactive `repoos init` flow, after the target project directory is known and before scaffolding:

- Prompt: `Where should RepoOS files live? [repoos/]`
- Enter accepts the new `repoos/` default.
- A user may type another safe repository-relative directory, such as `.meta/repoos/`, if it does not escape the repository root.
- Explicitly explain that entering `/` chooses the repository-root layout (`work/`, `docs/`, and `.repoos/` at root).
- Show the resolved layout in the confirmation preview before creating files.
- Use the same prompt, default, validation, and terminology for both new-project and existing-repository initialization.

For an existing Git repository, non-interactive initialization must use the new `repoos/` default without blocking. The current non-interactive behavior for creating a brand-new project may remain unchanged if that flow still requires a terminal; if it gains non-interactive support, it must use the same `repoos/` default.

Preserve the existing opt-in AGENTS.md appendix preview/approval flow. Its wording must point to the configured task/docs locations rather than assuming root `work/` and `docs/`.

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

The root choice (`/`) must preserve the current root-path behavior. The selected directory is a layout namespace, not a custom RepoOS project root: discovery still uses root `repoos.toml`.

## Compatibility and safety

- This is a new default for fresh RepoOS installations only. Never move or rewrite an existing RepoOS installation.
- If root `repoos.toml` already exists, respect its configured paths and retain current idempotent behavior.
- Never overwrite an existing `repoos/` or user-selected directory. Detect collisions and provide a clear recovery choice/error.
- Validate paths: reject absolute paths other than the special `/` root choice, parent traversal, paths outside the repo, and unsafe/invalid input.
- Keep `.gitignore` accurate for the selected cache path and existing root-layout projects.
- Make template task text, generated AGENTS.md, output summaries, docs, and first-run hints reflect the selected layout.
- Existing users should not need a migration; this affects newly initialized repositories only.

## Documentation

Update new-project and existing-repo onboarding plus configuration/layout documentation to recommend the namespaced default, show the `/` root alternative, and explain why `repoos.toml` and `AGENTS.md` stay at root.

## Acceptance criteria

- Every interactive fresh `repoos init` flow defaults to `repoos/`, lets the user choose a safe custom directory, and explicitly supports `/` for root.
- The confirmation preview accurately lists the paths that will be created.
- The default namespaced layout works end-to-end: tasks, docs, cache, discovery, CLI commands, server, and generated starter content all use the configured paths.
- Root layout remains available and behaves as before when `/` is selected.
- Existing installations are never relaid out or modified unexpectedly.
- Non-interactive existing-repo init is deterministic and uses the namespaced default only for a fresh installation.
- Tests cover both init flows' defaults, root selection, custom namespace, invalid path, collision, idempotent existing setup, and generated config/AGENTS.md content.

## Activity

- 2026-09-17T14:26:27Z · created · unknown
- 2026-09-17T14:46:56Z · body
- 2026-09-17T14:51:52Z · model_override
- 2026-09-17T14:52:04Z · review_model_override
