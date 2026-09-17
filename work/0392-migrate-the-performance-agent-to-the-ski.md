---
id: "0392"
title: Migrate the Performance Agent to the skill-guided runner
type: feature
status: inbox
priority: p1
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-17T14:03:32Z"
updated_at: "2026-09-17T14:03:32Z"
---
## Problem

Depends on #0389 landing first (the shared skill-guided runner + deterministic auto-fix verification gate) — do not start this until that's done.

`scanForPerformanceIssues` (`src/server/built-in-agents.ts`) has the same generalization gap as Tech Debt: it scans `config.root` filtered by the hardcoded `SOURCE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".vue"]`, so any non-JS/TS project gets effectively zero coverage and a silent "no issues found." No LLM is involved in the current implementation.

One of the five deterministic scanners covered in spirit by #0243 (now split into #0389 + per-agent tasks including this one).

## Desired UX

Replace the deterministic scan with a call through #0389's shared runner, driven by a skill doc describing what "performance" issues mean in general — slow/blocking operations, deeply nested loops, unbounded memory growth, duplicate computation — evaluated against whatever language(s) the repo actually uses. Findings still land as deduplicated inbox tasks, same as today.

## Acceptance criteria

- [ ] The agent runs through #0389's shared runner and skill doc, not the current `SOURCE_EXTS`-filtered deterministic scan.
- [ ] Running it against a non-JS/TS project (or a fixture standing in for one) produces meaningful findings instead of silently scanning zero files.
- [ ] Existing behavior preserved: deduplicated inbox tasks, enable/schedule/cli/model config, `lastRunAt` tracking.
- [ ] Model/connector failures surface clearly and route back to this agent's settings.
- [ ] `repoos check` passes.

## Notes for AI

- Depends on #0389. Read that task first.
- Keep `PerformanceRunResult`'s existing shape so the UI and server route don't need unrelated changes.
- Background: #0243 (the task this was split from).

## Activity

- 2026-09-17T14:03:32Z · created · unknown
