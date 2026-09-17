---
id: "0394"
title: Migrate the Design Agent to the skill-guided runner
type: feature
status: inbox
priority: p1
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-17T14:03:53Z"
updated_at: "2026-09-17T14:03:53Z"
---
## Problem

Depends on #0389 landing first (the shared skill-guided runner + deterministic auto-fix verification gate) — do not start this until that's done.

`scanForDesignIssues` (`src/server/built-in-agents.ts`) is the most severely non-general of the five deterministic scanners: it's hardcoded to the literal path `join(config.root, "src", "ui-app", "src")` — RepoOS's own frontend directory, by name — and further filters to `components/*.vue` / `views/*.vue`. Any other project, including another Vue project with a different folder layout, or any React/Svelte/Angular project, gets "No web UI source found — the scan only looks under `src/ui-app/src/`." No LLM is involved in the current implementation.

One of the five deterministic scanners covered in spirit by #0243 (now split into #0389 + per-agent tasks including this one).

## Desired UX

Replace the deterministic scan with a call through #0389's shared runner, driven by a skill doc describing UI/UX review — layout, styling consistency, accessibility, interaction flow quality — that has the agent figure out whether the project has a web UI at all (from `package.json` dependencies / repo structure) and where it lives, rather than assuming a fixed path and framework. If a project has no detectable web UI, the agent should say so clearly rather than silently reporting "0 files scanned" as if that were a clean result. Output stays a markdown report saved to `docs/agents/Design/`, same as today.

## Acceptance criteria

- [ ] The agent runs through #0389's shared runner and skill doc, not the current hardcoded-path deterministic scan.
- [ ] Running it against this repo still finds the actual UI under `src/ui-app/src/` — not because that path is hardcoded, but because the agent correctly identifies it from the repo's own structure/manifests.
- [ ] Running it against a project with a different UI framework or folder layout (or a fixture standing in for one) produces a meaningful review instead of "No web UI source found."
- [ ] A project with genuinely no web UI gets a clear "no UI detected" result, not a silent zero.
- [ ] Report still saved to `docs/agents/Design/` with the existing filename convention.
- [ ] Existing behavior preserved: enable/schedule/cli/model config, `lastRunAt` tracking.
- [ ] Model/connector failures surface clearly and route back to this agent's settings.
- [ ] `repoos check` passes.

## Notes for AI

- Depends on #0389. Read that task first.
- Keep `DesignRunResult`'s existing shape so the UI and server route don't need unrelated changes.
- Background: #0243 (the task this was split from).

## Activity

- 2026-09-17T14:03:53Z · created · unknown
