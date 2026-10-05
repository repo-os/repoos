---
id: "0673"
title: "Opt-in project docs: --docs-from import, starter skeleton, and a doctor wiring check"
type: feature
status: inbox
priority: p3
area: cli
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-10-05T15:20:13Z"
updated_at: "2026-10-05T15:20:13Z"
---
## Problem

People often bring their own project docs right after `repoos init` (for example a doc set drafted in an earlier AI chat that already knows how RepoOS works), while first-time users do not know what an agent needs to be effective. Today RepoOS gives neither group any help: init creates an empty `docsDir`, and nothing checks that agents are actually pointed at the docs. In a real project the thing that made cheap models effective was: one index file with a reading order, a short block of hard rules in AGENTS.md that points at that index, a glossary, and reference material kept out of the build. Nothing in RepoOS verifies or encourages that wiring.

## Desired UX

Opt-in, never prescriptive:

- `repoos init ... --docs-from <dir|file>` (and a matching `repoos docs import <dir|file>`) copies an existing doc set into `docsDir`, preserving structure, refusing to overwrite without `--force`, and reporting what was copied.
- In the guided flow, an unchecked-by-default prompt: "Scaffold starter project docs? [y/N]". When yes, create a minimal skeleton in `docsDir`: `README.md` (index with a reading order and an "if you learn something durable, write it here" line), `product.md`, `architecture.md`, `conventions.md`, `glossary.md`, each a few lines with prompts for what to put there. Never created by default.
- `repoos doctor` gains a docs wiring check: warns when (a) `AGENTS.md` does not mention the docs index (`docsDir/README.md`), (b) docs exist that no index links to, (c) the docs dir is empty while tasks exist. Each warning has a one-line fix hint. It is advisory (exit code unchanged).
- The vision starter task (when seeded) says: "If docs already exist in `docsDir`, read them first instead of asking the owner for the vision."

## Acceptance criteria

- `--docs-from` / `repoos docs import` implemented with tests (directory, single file, collisions, `--force`, dry run).
- The skeleton generator is opt-in, covered by tests, and produces files that pass the new doctor check out of the box.
- Doctor checks (a)-(c) implemented as pure functions with unit tests; wired into `repoos doctor` output and the Checks/health UI only if a natural place exists (otherwise CLI only).
- Docs: `user-docs/getting-started.md` and `user-docs/cli.md` updated.
- No new default behaviour for users who do not pass the flag or answer yes. `repoos check` passes.

## Notes for AI

Owner guidance (important): do NOT make starter docs the default and do not impose a structure; the point is import + a wiring check, with the skeleton as an opt-in convenience for people who do not know what to write. Never hand-edit work/*.md.

## Activity

- 2026-10-05T15:20:13Z · created · unknown
