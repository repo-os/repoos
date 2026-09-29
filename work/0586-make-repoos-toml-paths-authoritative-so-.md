---
id: "0586"
title: Make repoos.toml paths authoritative so agents never relocate docs/work dirs
type: bug
status: active
priority: p2
area: agents
assigned_to: ai
created_by: ""
branch: feat/make-repoos-toml-paths-authoritative-so-
created_at: "2026-09-29T18:59:05Z"
updated_at: "2026-09-29T19:27:40Z"
handoff_signal_retry_count: 1
---
## Problem

In a fresh `repoos init` (default `repoos/` namespace), a user dropped project context files into `repoos/` and `repoos/docs/` and asked the PM agent to "check the dir structure and fix it if it's not right." The PM concluded the layout was wrong and **moved `docs/` to the repo root**, against the configured `docsDir = "repoos/docs"`. Its reasoning: it called `repoos/docs` "tooling-owned" (invented; not in any RepoOS doc) and trusted the user's own design-kit docs (which said root-level `docs/`) over `repoos.toml`. `repoos doctor` still passed afterwards because it only checks the configured dirs exist.

## Root causes

1. Nothing tells agents that `repoos.toml` paths (`workDir`, `docsDir`, `cacheDir`) are authoritative and must not be relocated. The init AGENTS.md template (`AGENTS_MD` in `src/commands/init.ts`) only says "project docs under `${docsDir}/`".
2. The PM prompts (`taskPmPrompt` / `storyPmPrompt` in `src/server/agents.ts`) say nothing about layout or config-owned paths.
3. Stale docs still describe the pre-#0397 default: `docs/README.md:10`, `docs/concepts.md:139`, top-level `README.md:99` say init creates root `docs/`.
4. `repoos doctor` doesn't detect a configured dir that was emptied/replaced by a pointer file, or content that looks misplaced.

## Acceptance criteria

- The init AGENTS.md template states: `repoos.toml` paths are authoritative; never relocate `workDir`/`docsDir`; if project docs disagree with config, flag it to the human (or change `repoos.toml` only with human approval), and do not invent ownership rules.
- Both PM prompts carry the same rule, including for "check/fix the layout" requests: the correct fix for a mismatch is usually to report it, or to change config with approval, never to move directories on its own.
- Stale lines above are corrected to the namespaced default.
- `repoos doctor` warns when `docsDir`/`workDir` exists but looks hollowed out while the same content exists elsewhere (e.g. root `docs/` present while configured docsDir holds only a README), pointing at the config option.
- Tests cover the template text and PM prompt text.
- Existing repos: consider whether a `repoos init` re-run or doctor should offer to add the rule to an existing AGENTS.md (existing appendix flow, `REPOOS_AGENTS_SECTION`).

## Activity

- 2026-09-29T18:59:05Z · created · unknown
- 2026-09-29T19:19:50Z · status inbox→ready
- 2026-09-29T19:19:52Z · status ready→active, branch
- 2026-09-29T19:27:40Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
