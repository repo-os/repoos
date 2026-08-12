---
id: "0126"
title: Optimize AI token usage to reduce provider costs
type: chore
status: done
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: feat/optimize-ai-token-usage-to-reduce-provid
cli_override: claude code
model_override: sonnet
created_at: "2026-08-12T06:49:58Z"
updated_at: "2026-08-12T08:37:16Z"
---
## Problem

AI token usage is a material cost driver for RepoOS operations. Without systematic optimization, spend on model providers increases with usage volume. Different tasks have different efficiency profiles — some can run on smaller models without quality loss, some benefit from specific skills that reduce token consumption, and some task patterns require more careful model selection. Current token usage lacks visibility and optimization strategy.

## Desired UX

A documented, actionable optimization strategy that includes:
- Clear recommendations for which models to use for specific job types and tasks
- Guidance on which skills (e.g., caveman, rtk) and tool combinations reduce token consumption effectively
- A framework for evaluating token efficiency tradeoffs (speed vs. cost, quality vs. cost)
- Patterns to avoid for high-token consumption

## Acceptance criteria

- [ ] Audit RepoOS's current task patterns and identify high-token-consumption scenarios
- [ ] Document efficiency characteristics for available models (Haiku, Sonnet, Opus, Fable) and their appropriate use cases
- [ ] Analyze and recommend specific skills (caveman, rtk, simplify, etc.) that reduce token usage for common workflows
- [ ] Create a decision framework for model selection based on task type, quality requirements, and cost constraints
- [ ] Identify tool combinations or execution patterns that minimize token overhead
- [ ] Produce a concise reference guide (consumable by engineers) with clear recommendations
- [ ] Suggest architectural or workflow changes that could reduce overall token consumption

## Notes for AI

- Focus on practical, implementable strategies rather than theoretical optimizations
- Caveman and rtk are mentioned as examples — research their actual token efficiency characteristics
- Consider both direct token savings (smaller models) and indirect savings (fewer tool calls, reduced context)
- The goal is concrete recommendations that can be applied immediately to existing tasks
- Assume the reference guide will be consumed by both AI agents and human engineers making task decisions
- Do not propose features or code changes; this is strategy and recommendations only

## Scope

**Covers:** Token efficiency analysis, model selection framework, skill usage patterns, cost-reduction recommendations

**Deferred:** Implementation of cost-saving changes, CI/CD integration of optimizations, long-term monitoring dashboards

## Activity

- 2026-08-12T06:49:58Z · created · unknown
- 2026-08-12T06:51:08Z · cli_override, model_override
- 2026-08-12T06:51:11Z · status inbox→ready
- 2026-08-12T06:58:46Z · status ready→review, branch
- 2026-08-12T08:37:16Z · status review→done
