---
id: "0393"
title: Migrate the Architect Agent to the skill-guided runner
type: feature
status: inbox
priority: p1
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-17T14:03:42Z"
updated_at: "2026-09-17T14:03:42Z"
---
## Problem

Depends on #0389 landing first (the shared skill-guided runner + deterministic auto-fix verification gate) — do not start this until that's done.

`scanForArchitectureIssues` (`src/server/built-in-agents.ts`) has the same generalization gap as Tech Debt/Performance: scans `config.root` filtered by the hardcoded `SOURCE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".vue"]`. Architecture analysis (layer violations, tight coupling, missing abstractions, over-engineering, scalability risks) is exactly the kind of judgment call that benefits most from real reasoning about intent rather than pattern matching, and currently gets none — no LLM is involved in the implementation at all.

One of the five deterministic scanners covered in spirit by #0243 (now split into #0389 + per-agent tasks including this one).

## Desired UX

Replace the deterministic scan with a call through #0389's shared runner, driven by a skill doc describing what architectural review means — coupling, layering, abstraction quality, scalability risk — evaluated against the repo's actual structure and language(s), not a hardcoded extension allowlist. Output stays a markdown report saved to `docs/agents/Architect/`, same as today (per #0243's original scope: "Architect and Design should produce review reports, with explicit user approval before material writes outside those established outputs").

## Acceptance criteria

- [ ] The agent runs through #0389's shared runner and skill doc, not the current `SOURCE_EXTS`-filtered deterministic scan.
- [ ] Running it against a non-JS/TS project (or a fixture standing in for one) produces a meaningful report instead of silently scanning zero files.
- [ ] Report still saved to `docs/agents/Architect/` with the existing filename convention.
- [ ] Existing behavior preserved: enable/schedule/cli/model config, `lastRunAt` tracking, any task-creation the current implementation does.
- [ ] Model/connector failures surface clearly and route back to this agent's settings.
- [ ] `repoos check` passes.

## Notes for AI

- Depends on #0389. Read that task first.
- Keep `ArchitectRunResult`'s existing shape so the UI and server route don't need unrelated changes.
- Background: #0243 (the task this was split from).

## Activity

- 2026-09-17T14:03:42Z · created · unknown
