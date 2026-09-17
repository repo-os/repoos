---
id: "0391"
title: Migrate the Tech Debt Agent to the skill-guided runner
type: feature
status: inbox
priority: p1
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-17T14:03:23Z"
updated_at: "2026-09-17T14:03:23Z"
---
## Problem

Depends on #0389 landing first (the shared skill-guided runner + deterministic auto-fix verification gate) — do not start this until that's done.

`scanForTechDebt` (`src/server/built-in-agents.ts`) scans `config.root` but only files matching the hardcoded `SOURCE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".vue"]`. A Python, Go, Rust, or Java project managed by RepoOS gets roughly zero files matched and the agent reports "no tech debt issues found" — which reads as a clean bill of health, not as "this tool can't see your code." No LLM is involved anywhere in the current implementation (confirmed by grep for `runPrompt`/`AgentRunner` in the file — no matches).

This is one of the five deterministic scanners covered in spirit by #0243 (now split into #0389 + per-agent tasks including this one).

## Desired UX

Replace the deterministic scan with a call through #0389's shared runner, driven by a skill doc describing what "tech debt" means for a codebase in general — outdated dependencies, duplication, high-complexity files, unused code, deprecated APIs — evaluated against whatever language(s) the actual repo uses, not a hardcoded extension allowlist. Findings still land as deduplicated inbox tasks, same as today (per #0243's original scope: "Tech Debt and Performance may create deduplicated inbox tasks").

## Acceptance criteria

- [ ] The agent runs through #0389's shared runner and skill doc, not the current `SOURCE_EXTS`-filtered deterministic scan.
- [ ] Running it against a non-JS/TS project (or a fixture standing in for one) produces meaningful findings instead of silently scanning zero files.
- [ ] Existing behavior preserved: deduplicated inbox tasks, enable/schedule/cli/model config, `lastRunAt` tracking.
- [ ] Model/connector failures surface clearly and route back to this agent's settings (per #0389's failure-handling requirement) — #0243's two failed attempts hit exactly this class of problem (quota exceeded, missing handoff signal) with no clear recovery path.
- [ ] `repoos check` passes.

## Notes for AI

- Depends on #0389. Read that task first.
- Keep `TechDebtRunResult`'s existing shape (`issuesFound`, `scannedFiles`, `created`, `failed`, `errors`) so the UI and server route don't need unrelated changes.
- Background: #0243 (the task this was split from, including its two failed run attempts — see its activity log for the specific errors to avoid repeating).

## Activity

- 2026-09-17T14:03:23Z · created · unknown
