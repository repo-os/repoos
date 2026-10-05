---
id: "0673"
title: "Opt-in project docs: --docs-from import, starter skeleton, and a doctor wiring check"
type: feature
status: review
priority: p3
area: cli
assigned_to: ai
created_by: ""
branch: feat/opt-in-project-docs-docs-from-import-sta
created_at: "2026-10-05T15:20:13Z"
updated_at: "2026-10-05T17:57:07Z"
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
- 2026-10-05T15:20:27Z · note: Owner context (2026-10-05): the main reason for --docs-from is the owner's own workflow: they keep a ready-made docs directory (drafted in earlier AI chats that already know how RepoOS works) and drop it into EVERY new RepoOS project right after init. Design implications: (1) --docs-from must handle a whole nested doc tree, not just one file, and be safe to re-run; (2) add an optional user-level default so it needs no flag each time, e.g. a RepoOS user config key or env var (init.docsTemplate / REPOOS_DOCS_TEMPLATE pointing at a directory) used by 'repoos init' when set, with an opt-out flag (--no-docs-template); (3) the import ships first, the starter skeleton and doctor wiring check can follow as separate tasks. Suggested priority bump p3 -> p2 once the owner agrees.
- 2026-10-05T15:28:26Z · note: Owner clarification (2026-10-05): the owner's real workflow is interactive 'repoos init', then manually moving a docs dir (kept in ~/Downloads, contents differ per project) into the new repo. So the PRIMARY deliverables are: (1) 'repoos init <name> --docs-from <dir>' and 'repoos docs import <dir>', and (2) a prompt in the GUIDED interactive flow: 'Import existing docs from a folder? (path, Enter to skip)', placed right after the description/areas questions, with ~ expansion and a clear error if the path does not exist. Treat the user-level saved default (init.docsTemplate / REPOOS_DOCS_TEMPLATE) as OPTIONAL and low priority: only useful if the same folder is reused for every project, which is not the owner's case. Supersedes the earlier note's emphasis on the saved default.
- 2026-10-05T15:33:34Z · note: Owner decision (2026-10-05): DROP the saved default entirely (no init.docsTemplate / REPOOS_DOCS_TEMPLATE / --no-docs-template); the owner uses a different path every time. ADD: the source may be a .zip. --docs-from <path> and the interactive prompt must accept (a) a directory, (b) a single file, or (c) a .zip archive (typical browser download, e.g. ~/Downloads/docs.zip) and unpack it automatically. Zip requirements: extract to a temp dir, then import; if the archive has a single top-level folder (very common, e.g. docs/ or project-docs/) use its contents rather than nesting an extra level; ignore macOS junk (__MACOSX/, .DS_Store, ._* files); reject path traversal (zip-slip: entries resolving outside the extraction dir) and absurd sizes/entry counts; refuse symlinks; clean the temp dir afterwards. Zero runtime dependencies is a hard RepoOS constraint, so use the system unzip or Node/Bun built-ins rather than adding an npm dependency (Bun has no built-in zip reader; shelling out to 'unzip' or 'bsdtar' is acceptable with a clear error if neither exists). Tests: zip with single top-level folder, zip with files at root, zip containing __MACOSX, a zip-slip attempt, a corrupt zip, a missing path.
- 2026-10-05T15:37:04Z · status inbox→ready
- 2026-10-05T15:37:09Z · status ready→active, branch
- 2026-10-05T17:57:07Z · status active→review
