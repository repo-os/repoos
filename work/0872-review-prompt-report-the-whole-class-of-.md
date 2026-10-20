---
id: "0872"
title: "Default agent prompts for every project: reviewer (whole class, merge check, evidence gaps), engineer and PM learnings"
type: chore
status: inbox
priority: p1
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-20T12:06:43Z"
updated_at: "2026-10-20T12:18:31Z"
---
## Problem
The review prompt built in src/server/review.ts (the shared part every project gets) does not tell the reviewer to find every instance of a bug class, to read earlier review reports, or to check that the branch merges with its base. The result on 2026-10-20: #0843 needed 22+ review passes, #0854 15+, #0861 13, each pass finding one more instance of the same class (service-lifecycle teardown, runner fallback and import safety, config-key registration), plus avoidable rounds on evidence-only gaps and a "good to go" on a commit that still conflicted with main (#0860). For RepoOS itself the reviewer role text in repoos.toml was updated by hand on 2026-10-20; every other project still gets the old behavior.

## Desired UX
The built-in default prompts that every new RepoOS project gets (the `repoos init` role templates and any built-in default role instructions) carry the lessons RepoOS learned driving itself, split into a general part and clearly project-specific parts.

Reviewer (shared prompt in src/server/review.ts plus the init template): name the class of each bug and grep the diff and touched files for every other instance, listing them all in one report; read the newest earlier reports for the task, verify each finding was fixed and never re-report a fixed item as new; separate code defects from evidence-only or stale-evidence gaps and check that each declared shot's target and route can render its declared state; confirm the branch merges cleanly with its base before "good to go" and name conflicting files. After about five "needs some work" passes on one task, the next report opens with a summary of the repeated classes and the task is flagged for a human.

Engineer default: declare shots with `repoos update --shots` (explicit target, a route that really serves the screen, a highlight that exists, then look at the PNG), never a full `--body`; before handoff re-read the newest review report and messages, fix every item and the whole class of each finding with table-driven tests; a new config key needs a Settings control, schema entry, supported-keys entry and docs; run the scoped check once and hand off only when it passes, ending with the handoff signal on its own line; after a merge conflict merge main and take main's task file; never move your own task out of active; ask for human-only criteria to be split into a held human task instead of claiming them.

PM default: create and change tasks only through `repoos` commands or the API; the required body headings; search the board before filing; area vocabulary and priority by cost of waiting; attach every task to the relevant story with `--story` (leave it empty and say so when none fits); set real dependencies with `--depends-on` in both directions without cycles; small independent fixes into the one open easter-egg bundle; human-only criteria as a separate held task; attach every screenshot; file a recurring review bug class as one task.

Project-specific rules (Bun not Node, never edit repoos.toml, never commit dist/, no runtime dependencies, Copilot path rules) stay in each project's own repoos.toml and AGENTS.md and are NOT in the built-in defaults.

## Acceptance criteria
- src/server/review.ts shared review prompt contains the class-enumeration, earlier-report, evidence-gap and merge-ability instructions; the verdict and section format rules are unchanged and the parser tests pass.
- The `repoos init` role templates (reviewer, engineer, pm) and any built-in default role instructions carry the general text above; project-specific rules are left out of the defaults, and a test asserts that.
- Prompt-content tests assert each general instruction is present in the right role and that the old format guarantees still hold; a test fails if a Bun/Node-specific or RepoOS-only rule leaks into the defaults.
- After N passes (default 5, configurable with a Settings control and documentation) the review report includes the repeated-class summary and the task shows a human-attention flag, distinct from the existing review-rounds-exhausted backstop.
- Existing projects keep their own `repoos.toml` role text untouched; document how to adopt the new defaults (for example a command or a docs snippet) without overwriting customizations.
- Do NOT edit this repo's own repoos.toml: the human already updated its reviewer, engineer and pm instructions on 2026-10-20.
- Docs updated (review and close-out docs, init docs).

## Notes for AI
Wording sources, all in this repo's repoos.toml as edited on 2026-10-20: the reviewer instructions (grep `Report the WHOLE CLASS`), the engineer instructions (grep `declare what a reviewer should see`) and the pm instructions (grep `Owns the roadmap`). Strip the RepoOS-specific parts (Bun, dist/, repoos.toml, Copilot path rule) when copying them into defaults. Find where `repoos init` writes the default roles (src/commands/init.ts) and where built-in default role instructions live (src/core/config.ts). Keep the reviewer prompt short enough not to slow reviews noticeably. Related: #0865 (stop reviews chaining), #0866 (shot target validation), #0867 (landable command: the reviewer's merge check can call it once it exists).


## Activity

- 2026-10-20T12:06:43Z · created · njachowski@gmail.com
- 2026-10-20T12:18:19Z · title
- 2026-10-20T12:18:23Z · body: Desired UX (added 5, removed 1)
- 2026-10-20T12:18:27Z · body: Acceptance criteria (added 7, removed 5)
- 2026-10-20T12:18:31Z · body: Notes for AI (added 1, removed 1)
